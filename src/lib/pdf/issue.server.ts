import "server-only";
import { buildLetterDocument, runsText } from "@/lib/letter/build";
import { blockingProblems, letterSections } from "@/lib/letter/fields";
import type { Json } from "@/lib/supabase/database.types";
import { adminClient } from "@/lib/supabase/admin";
import { snapshotDraft, versionInputs, type PrintInputs } from "./inputs.server";
import { renderLetterPdf, type PdfMetadata } from "./render.server";
import { contentHash, type IssuedCompany, type IssuedSnapshot } from "./snapshot";

// Issuing: freezing a letter as an immutable version and storing its final PDF. Server-only, with the secret key;
// called after PayU confirms a payment and for free corrections (never directly by the browser).

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
    language: doc.language,
  };
}

export type IssuedVersion = { versionId: string; version: number; pdfPath: string; contentHash: string };

export type FrozenLetter = { snapshot: IssuedSnapshot; company: IssuedCompany };

/**
 * Issues a version of a letter: from `frozen` (the letter as it was when the user paid, or a correction built on
 * the issued wording) or else from the letter as it is now. `version` defaults to the next one. Safe to call twice
 * for the same version: PayU's return and its webhook can race, and the loser gets the version the winner made.
 */
export async function issueLetterVersion(
  letterId: string,
  { note, frozen, version: wanted }: { note?: string; frozen?: FrozenLetter; version?: number } = {},
): Promise<IssuedVersion> {
  const db = adminClient();
  // A frozen letter carries its own wording, so it issues even if its country has since been switched off.
  const current = frozen
    ? await db.from("letters").select("current_version, author_id").eq("id", letterId).maybeSingle().then(({ data }) => data && { ...frozen, letter: data })
    : await snapshotDraft(letterId);
  if (!current) throw new IssueError("not_found", "Letter not found");
  const { snapshot, company, letter } = current;

  const problems = blockingProblems(snapshot.context, snapshot.state, snapshot.date);
  if (problems.missing.length || problems.invalid.length) {
    throw new IssueError("incomplete", `The letter isn't complete: ${[...problems.missing.map((f) => f.key), ...problems.invalid.map((p) => p.field.key)].join(", ")}`);
  }

  const hash = contentHash(snapshot, company);
  const version = wanted ?? letter.current_version + 1;
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
  if (error?.code === "23505") {
    // Someone else issued this version a moment ago (the other of return and webhook): use theirs.
    const { data: existing } = await db.from("letter_versions").select("id, version, content_hash").eq("letter_id", letterId).eq("version", version).single();
    if (!existing) throw new IssueError("storage", "The version was issued twice and can't be read back");
    const pdfPath = await ensureVersionPdf(existing.id);
    return { versionId: existing.id, version: existing.version, pdfPath, contentHash: existing.content_hash };
  }
  if (error || !inserted) throw new IssueError("storage", `Couldn't save the version: ${error?.message}`);

  const { error: letterError } = await db.from("letters").update({ current_version: version, pinned_clauses: pinned }).eq("id", letterId).lt("current_version", version);
  if (letterError) throw new IssueError("storage", `Couldn't update the letter: ${letterError.message}`);

  const pdfPath = await ensureVersionPdf(inserted.id, { authorId: letter.author_id, letterId, version, hash });
  return { versionId: inserted.id, version, pdfPath, contentHash: hash };
}

/**
 * Renders and stores a version's final PDF, and its translation's when one was issued with it, if they aren't stored
 * yet (also the retry when rendering failed after the version was saved). Both are recorded together, so a version
 * shows as ready only once every PDF it has is there. Stored paths are set once and never replaced.
 */
export async function ensureVersionPdf(
  versionId: string,
  known?: { authorId: string; letterId: string; version: number; hash: string },
): Promise<string> {
  const db = adminClient();
  const { data: row } = await db
    .from("letter_versions")
    .select("id, letter_id, version, content_hash, pdf_path, translated_pdf_path, snapshot, letters(author_id)")
    .eq("id", versionId)
    .maybeSingle();
  if (!row) throw new IssueError("not_found", "Version not found");
  const language = (row.snapshot as unknown as IssuedSnapshot).translation?.language;
  if (row.pdf_path && (!language || row.translated_pdf_path)) return row.pdf_path;

  const authorId = known?.authorId ?? row.letters?.author_id;
  if (!authorId) throw new IssueError("not_found", "Letter author not found");
  const base = `${authorId}/${row.letter_id}/v${row.version}-${row.content_hash.slice(0, 12)}`;

  const store = async (lang: string, path: string) => {
    const inputs = await versionInputs(versionId, lang);
    if (!inputs) throw new IssueError("not_found", `Version snapshot not found (${lang})`);
    const pdf = await renderLetterPdf({ kind: "version", id: versionId, watermark: false, language: lang }, letterMetadata(inputs, false));
    const upload = await db.storage.from(LETTERS_BUCKET).upload(path, pdf, { contentType: "application/pdf", upsert: false });
    if (upload.error && !/exists/i.test(upload.error.message)) throw new IssueError("storage", `Couldn't store the PDF: ${upload.error.message}`);
    return path;
  };
  const update: { pdf_path?: string; translated_pdf_path?: string } = {};
  if (!row.pdf_path) update.pdf_path = await store("en", `${base}.pdf`);
  if (language && !row.translated_pdf_path) update.translated_pdf_path = await store(language, `${base}.${language}.pdf`);

  let query = db.from("letter_versions").update(update).eq("id", versionId);
  if (update.pdf_path) query = query.is("pdf_path", null);
  if (update.translated_pdf_path) query = query.is("translated_pdf_path", null);
  const { error } = await query;
  if (error) throw new IssueError("storage", `Couldn't record the PDF: ${error.message}`);
  return row.pdf_path ?? update.pdf_path!;
}
