import type { FieldDefinition, FieldType, ResolvedClause } from "./types";

// Picking content for a jurisdiction. `chain` is the jurisdiction and its parents, most specific first:
// US-CA → [US-CA, US]. These mirror the database's section_locked() and jurisdiction rules.

export type ClauseRow = {
  id: string;
  section_key: string;
  jurisdiction_code: string;
  title: string | null;
  body: string;
  locked: boolean;
  locked_reason: string | null;
  editor_help: string | null;
  review_status: "draft" | "in_review" | "approved";
  version: number;
};

const byPreference = (a: ClauseRow, b: ClauseRow) =>
  Number(b.review_status === "approved") - Number(a.review_status === "approved") || b.version - a.version;

/**
 * The most specific approved clause wins (US-CA before US). With `allowUnreviewed` (local development only),
 * drafts count too. A section with no eligible clause is left out of the letter.
 * The lock comes from the most specific clause of any review status, as in the database: a lock always wins.
 */
export function resolveClauses(
  rows: ClauseRow[],
  chain: { code: string; name: string }[],
  allowUnreviewed: boolean,
): Record<string, ResolvedClause> {
  const resolved: Record<string, ResolvedClause> = {};
  const sectionKeys = new Set(rows.map((row) => row.section_key));
  for (const sectionKey of sectionKeys) {
    const forSection = rows.filter((row) => row.section_key === sectionKey);
    let chosen: ClauseRow | undefined;
    let chosenAt: { code: string; name: string } | undefined;
    let lockSource: ClauseRow | undefined;
    for (const level of chain) {
      const atLevel = forSection.filter((row) => row.jurisdiction_code === level.code).sort(byPreference);
      lockSource ??= atLevel[0];
      const eligible = atLevel.filter((row) => allowUnreviewed || row.review_status === "approved");
      if (!chosen && eligible[0]) {
        chosen = eligible[0];
        chosenAt = level;
      }
    }
    if (!chosen || !chosenAt) continue;
    resolved[sectionKey] = {
      id: chosen.id,
      sectionKey,
      jurisdictionCode: chosen.jurisdiction_code,
      jurisdictionName: chosenAt.name,
      title: chosen.title,
      body: chosen.body,
      locked: Boolean(lockSource?.locked),
      lockedReason: lockSource?.locked ? lockSource.locked_reason : null,
      editorHelp: chosen.editor_help,
      reviewStatus: chosen.review_status,
      version: chosen.version,
    };
  }
  return resolved;
}

export type FieldRow = {
  key: string;
  section_key: string;
  label: string;
  type: FieldType;
  required: boolean;
  options: unknown;
  validation: unknown;
  help_text: string | null;
  placeholder: string | null;
  default_value: unknown;
  sort_order: number;
  jurisdictions?: string[] | null;
  jurisdiction_overrides: unknown;
};

type Override = Partial<Pick<FieldDefinition, "label" | "required" | "options" | "validation">> & {
  help_text?: string;
  default_value?: string | boolean;
};

const asDefault = (value: unknown) => (typeof value === "string" || typeof value === "boolean" ? value : null);

/**
 * Field definitions for a jurisdiction: fields limited to other countries are left out, and country overrides are
 * applied parent first so the most specific override wins.
 */
export function resolveFields(rows: FieldRow[], chain: { code: string }[]): FieldDefinition[] {
  const parentFirst = [...chain].reverse();
  const codes = new Set(chain.map((level) => level.code));
  return rows
    .filter((row) => !row.jurisdictions?.length || row.jurisdictions.some((code) => codes.has(code)))
    .map((row) => {
      const overrides = (row.jurisdiction_overrides ?? {}) as Record<string, Override>;
      const field: FieldDefinition = {
        key: row.key,
        sectionKey: row.section_key,
        label: row.label,
        type: row.type,
        required: row.required,
        options: (row.options as FieldDefinition["options"] | null) ?? [],
        validation: (row.validation as FieldDefinition["validation"] | null) ?? {},
        help: row.help_text,
        placeholder: row.placeholder,
        defaultValue: asDefault(row.default_value),
        sortOrder: row.sort_order,
      };
      for (const { code } of parentFirst) {
        const override = overrides[code];
        if (!override) continue;
        if (override.label) field.label = override.label;
        if (override.help_text !== undefined) field.help = override.help_text;
        if (override.required !== undefined) field.required = override.required;
        if (override.options) field.options = override.options;
        if (override.validation) field.validation = { ...field.validation, ...override.validation };
        if (override.default_value !== undefined) field.defaultValue = asDefault(override.default_value);
      }
      return field;
    })
    .sort((a, b) => a.sortOrder - b.sortOrder);
}

export type PhraseRow = { key: string; jurisdiction_code: string | null; text: string };

/** Default phrases, then country overrides from parent to child. */
export function resolvePhrases(rows: PhraseRow[], chain: { code: string }[]): Record<string, string> {
  const phrases: Record<string, string> = {};
  for (const row of rows) if (row.jurisdiction_code === null) phrases[row.key] = row.text;
  for (const { code } of [...chain].reverse()) {
    for (const row of rows) if (row.jurisdiction_code === code) phrases[row.key] = row.text;
  }
  return phrases;
}
