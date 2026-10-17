import { z } from "zod";
import { getUser } from "@/lib/auth";
import { LETTERS_BUCKET } from "@/lib/pdf/issue.server";
import { messagePage, pdfFileName } from "@/lib/pdf/responses";
import { clientKey, takeRateLimit } from "@/lib/rate-limit";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// Download of an issued version's PDF: the author gets a signed link that works for one minute, and the download
// is logged. The PDF itself never changes after it's stored.

export const runtime = "nodejs";

const SIGNED_SECONDS = 60;

export async function GET(_request: Request, { params }: RouteContext<"/api/letters/[id]/versions/[version]/pdf">) {
  const { id, version } = await params;
  const user = await getUser();
  if (!user) return messagePage(401, "Sign in to download this letter", "Your session has ended. Sign in again, then download it from the letter’s page.");
  const number = z.coerce.number().int().min(1).max(1000).safeParse(version);
  if (!z.uuid().safeParse(id).success || !number.success) return messagePage(404, "Letter not found", "This download link doesn’t match a letter.");

  if (!(await takeRateLimit(`pdf-download:${user.id}:${await clientKey()}`, 600, 60))) {
    return messagePage(429, "Too many downloads for now", "Wait a few minutes, then try again.");
  }

  // RLS: versions are readable by the letter's author only.
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("letter_versions")
    .select("id, version, pdf_path, letters!inner(name, author_id)")
    .eq("letter_id", id)
    .eq("letters.author_id", user.id)
    .eq("version", number.data)
    .maybeSingle();
  if (!row) return messagePage(404, "Letter not found", "We couldn’t find this version of the letter in your account.");
  if (!row.pdf_path) return messagePage(503, "The PDF is still being made", "It usually takes a few seconds. Try again shortly.");

  const admin = adminClient();
  const fileName = pdfFileName(`${row.letters?.name ?? "Offer letter"} v${row.version}`);
  const { data: signed, error } = await admin.storage.from(LETTERS_BUCKET).createSignedUrl(row.pdf_path, SIGNED_SECONDS, { download: fileName });
  if (error || !signed) {
    console.error("download link failed", error?.message);
    return messagePage(500, "We couldn’t prepare the download", "Try again in a moment.");
  }
  await admin.from("downloads").insert({ letter_version_id: row.id, user_id: user.id, kind: "final" });

  return new Response(null, { status: 303, headers: { location: signed.signedUrl, "cache-control": "private, no-store" } });
}
