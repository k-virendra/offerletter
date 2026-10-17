import { z } from "zod";
import { getUser } from "@/lib/auth";
import { isLocalStack } from "@/lib/env.server";
import { IssueError, issueLetterVersion } from "@/lib/pdf/issue.server";
import { createClient } from "@/lib/supabase/server";

// DEVELOPMENT ONLY: issues a version of one of your drafts without payment, so the PDF tests can make many final
// PDFs without going through checkout. Refused unless the app talks to a local Supabase stack.

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_request: Request, { params }: RouteContext<"/api/dev/letters/[id]/issue">) {
  if (!isLocalStack()) return Response.json({ error: "Not available" }, { status: 404 });
  const { id } = await params;
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in first" }, { status: 401 });
  if (!z.uuid().safeParse(id).success) return Response.json({ error: "Not found" }, { status: 404 });

  const supabase = await createClient();
  const { data: letter } = await supabase.from("letters").select("id").eq("id", id).eq("author_id", user.id).maybeSingle();
  if (!letter) return Response.json({ error: "Not found" }, { status: 404 });

  try {
    const issued = await issueLetterVersion(id, { note: "Issued in development without payment" });
    return Response.json(issued);
  } catch (error) {
    if (error instanceof IssueError) return Response.json({ error: error.message, reason: error.reason }, { status: error.reason === "incomplete" ? 422 : 500 });
    console.error("dev issue failed", error);
    return Response.json({ error: "Issuing failed" }, { status: 500 });
  }
}
