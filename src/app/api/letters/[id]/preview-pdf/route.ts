import { z } from "zod";
import { getUser } from "@/lib/auth";
import { draftInputs } from "@/lib/pdf/inputs.server";
import { letterMetadata } from "@/lib/pdf/issue.server";
import { renderLetterPdf } from "@/lib/pdf/render.server";
import { contentDisposition, messagePage, pdfFileName } from "@/lib/pdf/responses";
import { clientKey, takeRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

// "Preview PDF": the draft as it's saved now, printed with a PREVIEW – NOT VALID watermark. Rate-limited, because
// every preview starts a browser page on the server.

export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(_request: Request, { params }: RouteContext<"/api/letters/[id]/preview-pdf">) {
  const { id } = await params;
  const user = await getUser();
  if (!user) return messagePage(401, "Sign in to preview this letter", "Your session has ended. Sign in again, then open the preview from the editor.");
  if (!z.uuid().safeParse(id).success) return messagePage(404, "Letter not found", "This preview link doesn’t match a letter.");

  // RLS: only the author can read the letter.
  const supabase = await createClient();
  const { data: letter } = await supabase.from("letters").select("id, name, status").eq("id", id).maybeSingle();
  if (!letter) return messagePage(404, "Letter not found", "We couldn’t find this letter in your account.");

  const [perUser, perIp] = await Promise.all([takeRateLimit(`pdf-preview:${user.id}`, 600, 10), takeRateLimit(`pdf-preview:ip:${await clientKey()}`, 600, 30)]);
  if (!perUser || !perIp) {
    return messagePage(429, "Too many previews for now", "You’ve made a lot of previews in a short time. Wait a few minutes, then try again.");
  }

  const inputs = await draftInputs(id);
  if (!inputs) return messagePage(409, "This letter can’t be previewed right now", "Letters for its country have been switched off while their wording is updated.");

  try {
    const pdf = await renderLetterPdf({ kind: "draft", id, watermark: true }, letterMetadata(inputs, true));
    return new Response(Buffer.from(pdf), {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": contentDisposition("inline", pdfFileName(`${letter.name} (preview)`)),
        "cache-control": "private, no-store",
        "x-robots-tag": "noindex",
      },
    });
  } catch (error) {
    console.error("preview PDF failed", error);
    return messagePage(500, "We couldn’t make the preview", "Something went wrong while making the PDF. Try again in a moment.");
  }
}
