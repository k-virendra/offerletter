import { z } from "zod";
import { getUser } from "@/lib/auth";
import { changedLockedField, correctionChanges, correctionNote } from "@/lib/letter/corrections";
import { correctionOpen } from "@/lib/letter/letters.server";
import { snapshotDraft } from "@/lib/pdf/inputs.server";
import { IssueError, issueLetterVersion } from "@/lib/pdf/issue.server";
import { canonicalJson, type IssuedCompany, type IssuedSnapshot } from "@/lib/pdf/snapshot";
import { takeRateLimit } from "@/lib/rate-limit";
import { createClient } from "@/lib/supabase/server";

// "Issue corrected version": a free correction of a paid letter, inside its correction window. The new version is
// built from the letter as saved now, with the wording and date of the version it corrects.

export const runtime = "nodejs";
export const maxDuration = 60;

const fail = (status: number, error: string) => Response.json({ error }, { status });

export async function POST(request: Request, { params }: RouteContext<"/api/letters/[id]/corrections">) {
  const { id } = await params;
  // Only from this site's own pages (the session cookie alone would let another site trigger it).
  if (request.headers.get("origin") !== new URL(request.url).origin) return fail(403, "Open the letter in Offer Letter PDF to correct it.");
  const user = await getUser();
  if (!user) return fail(401, "Your session has ended. Sign in again to issue the correction.");
  if (!z.uuid().safeParse(id).success) return fail(404, "We couldn’t find this letter.");
  if (!(await takeRateLimit(`correction:${user.id}`, 600, 10))) return fail(429, "You’ve issued several corrections in a short time. Wait a few minutes, then try again.");

  // RLS: the author (or an admin) can read the letter and its versions; only the author may correct it.
  const supabase = await createClient();
  const { data: letter } = await supabase.from("letters").select("id, status, author_id, current_version, correction_until").eq("id", id).maybeSingle();
  if (!letter || letter.author_id !== user.id) return fail(404, "We couldn’t find this letter.");
  if (!correctionOpen(letter)) return fail(409, "The free correction period for this letter has ended.");
  const { data: latest } = await supabase
    .from("letter_versions")
    .select("version, snapshot, company_snapshot")
    .eq("letter_id", id)
    .eq("version", letter.current_version)
    .maybeSingle();
  if (!latest) return fail(409, "The letter’s latest version couldn’t be read.");

  const next = await snapshotDraft(id);
  if (!next) return fail(409, "The letter’s latest version couldn’t be read.");
  const before = latest.snapshot as unknown as IssuedSnapshot;
  const beforeCompany = latest.company_snapshot as unknown as IssuedCompany;
  if (changedLockedField(before.state.values, next.snapshot.state.values)) return fail(422, "The candidate’s name and the job title can’t change in a correction.");

  const companyChanged = canonicalJson({ ...beforeCompany, id: null }) !== canonicalJson({ ...next.company, id: null });
  const changes = correctionChanges(before.context, before.state, next.snapshot.state, companyChanged);
  if (!changes.length) return fail(409, `Nothing has changed since version ${latest.version}. Make your corrections first.`);

  try {
    const issued = await issueLetterVersion(id, { note: correctionNote(changes) });
    return Response.json({ version: issued.version });
  } catch (error) {
    if (error instanceof IssueError && error.reason === "incomplete") return fail(422, "Some required details are missing or need a fix.");
    console.error("issuing a correction failed", error);
    return fail(500, "We couldn’t issue the corrected version. Try again in a moment.");
  }
}
