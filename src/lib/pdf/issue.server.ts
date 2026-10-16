import "server-only";
import { buildLetterDocument, runsText } from "@/lib/letter/build";
import { blockingProblems, letterSections } from "@/lib/letter/fields";
import type { Json } from "@/lib/supabase/database.types";
import { adminClient } from "@/lib/supabase/admin";
import { snapshotDraft, versionInputs, type PrintInputs } from "./inputs.server";
import { renderLetterPdf, type PdfMetadata } from "./render.server";
import { contentHash } from "./snapshot";

// Issuing: freezing a paid draft as an immutable version and storing its final PDF. Server-only, with the secret
// key; the payment code calls this after PayU confirms the payment (never the browser).

export const LETTERS_BUCKET = "letters";

export class IssueError extends Error {
  override name = "IssueError";
  constructor(
    readonly reason: "not_found" | "not_draft" | "incomplete" | "storage",
    message: string,
  ) {
    super(message);
  }
}

/** Document properties: "Offer of employment – Lena Hoffmann", by the company, about the role. */
export function letterMetadata(inputs: Pick<PrintInputs, "context" | "state" | "company" | "date">, preview: boolean): PdfMetadata {
  const doc = buildLetterDocument(inputs.context, { ...inputs.company, logo: null }, inputs.state, { date: inputs.date });
  const candidate = runsText(doc.recipient.name).trim();
  const role = runsText(doc.title.subject).trim();
  return {
    title: `${doc.title.label}${candidate ? ` – ${candidate}` : ""}${preview ? " (preview)" : ""}`,
    author: inputs.company.legalName,
    subject: role ? `${doc.title.label}: ${role}` : doc.title.label,
    keywords: ["offer letter", inputs.context.jurisdiction.name],
  };
}

export type IssuedVersion = { versionId: string; version: number; pdfPath: string; contentHash: string };

export async function issueLetterVersion(letterId: string, { note }: { note?: string } = {}): Promise<IssuedVersion> {
  const frozen = await snapshotDraft(letterId);
  if (!frozen) throw new IssueError("not_found", "Letter not found");
  const { snapshot, company, letter } = frozen;

  const problems = blockingProblems(snapshot.context, snapshot.state, snapshot.date);
  if (problems.missing.length || problems.invalid.length) {
    throw new IssueError("incomplete", `The letter isn't complete: ${[...problems.missing.map((f) => f.key), ...problems.invalid.map((p) => p.field.key)].join(", ")}`);
  }

  const db = adminClient();
  const hash = contentHash(snapshot, company);
  const version = letter.current_version + 1;
  const pinned = Object.fromEntries(
    letterSections(snapshot.context, snapshot.state.removedSections).map((section) => [section.key, snapshot.context.clauses[section.key]!.id]),
  );

  const { data: inserted, error } = await db
    .from("letter_versions")
    .insert({
      letter_id: letterId,
      version,
      snapshot: snapshot as unknown as Json,
      company_snapshot: company as unknown as Json,
      content_hash: hash,
      note: note ?? null,
    })
    .select("id")
    .single();
  if (error || !inserted) throw new IssueError("storage", `Couldn't save the version: ${error?.message}`);

  const { error: letterError } = await db.from("letters").update({ current_version: version, pinned_clauses: pinned }).eq("id", letterId);
  if (letterError) throw new IssueError("storage", `Couldn't update the letter: ${letterError.message}`);

  const pdfPath = await ensureVersionPdf(inserted.id, { authorId: letter.author_id, letterId, version, hash });
  return { versionId: inserted.id, version, pdfPath, contentHash: hash };
}

/**
 * Renders and stores a version's final PDF if it doesn't have one yet (also the retry when rendering failed after
 * the version was saved). The stored path is set once and never replaced.
 */
export async function ensureVersionPdf(
  versionId: string,
  known?: { authorId: string; letterId: string; version: number; hash: string },
): Promise<string> {
  const db = adminClient();
  const { data: row } = await db.from("letter_versions").select("id, letter_id, version, content_hash, pdf_path, letters(author_id)").eq("id", versionId).maybeSingle();
  if (!row) throw new IssueError("not_found", "Version not found");
  if (row.pdf_path) return row.pdf_path;

  const inputs = await versionInputs(versionId);
  if (!inputs) throw new IssueError("not_found", "Version snapshot not found");
  const authorId = known?.authorId ?? row.letters?.author_id;
  if (!authorId) throw new IssueError("not_found", "Letter author not found");

  const pdf = await renderLetterPdf({ kind: "version", id: versionId, watermark: false }, letterMetadata(inputs, false));
  const path = `${authorId}/${row.letter_id}/v${row.version}-${row.content_hash.slice(0, 12)}.pdf`;
  const upload = await db.storage.from(LETTERS_BUCKET).upload(path, pdf, { contentType: "application/pdf", upsert: false });
  if (upload.error && !/exists/i.test(upload.error.message)) throw new IssueError("storage", `Couldn't store the PDF: ${upload.error.message}`);

  const { error } = await db.from("letter_versions").update({ pdf_path: path }).eq("id", versionId).is("pdf_path", null);
  if (error) throw new IssueError("storage", `Couldn't record the PDF: ${error.message}`);
  return path;
}
