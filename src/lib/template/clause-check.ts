import { parseTemplate, placeholderKeys as printedKeys, templateKeys, type TemplateNode } from "./parse";

// The rules every clause must follow, shared by the content loader (seeding from content/) and the admin
// clause editor, so a clause written in either place is checked the same way.

/** Values every clause may use that are not form fields (company details, dates, derived amounts). */
export const BUILT_IN_PLACEHOLDERS = new Set([
  "company.legal_name",
  "company.trading_name",
  "company.display_name",
  "company.registered_address",
  "company.registration_number",
  "company.website",
  "company.contact_phone",
  "company.contact_email",
  "letter.date",
  "jurisdiction.name",
  "pay.annual_amount",
  "pay.period_amount",
  "pay.frequency_label",
  "pay.instalments",
]);

/** Sections whose fields any clause may print: they are in every letter and can't be removed. */
export const SHARED_SECTIONS = new Set(["candidate", "position", "compensation", "acceptance"]);

/** {{field.key}}, {{#if field.key}} and {{/if}} placeholders in clause text. */
export function placeholderKeys(body: string): string[] {
  const keys = new Set<string>();
  for (const match of body.matchAll(/\{\{\s*([^{}]*?)\s*\}\}/g)) {
    for (const key of match[1]?.match(/[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+/g) ?? []) keys.add(key);
  }
  return [...keys];
}

export type ClauseField = { key: string; sectionKey: string; jurisdictions: string[] | null };

export type ClauseCheck = {
  errors: string[];
  /** Values printed into the text. */
  placeholders: number;
  /** {{#if}} / {{#unless}} blocks. */
  conditions: number;
};

/**
 * Checks a clause for a section in a jurisdiction (`chain`: it and its parents, most specific first). The letter
 * builder can't render a clause with errors, so they block saving.
 */
export function checkClause(body: string, { sectionKey, fields, chain, allowHtml = false }: { sectionKey: string; fields: ClauseField[]; chain: string[]; allowHtml?: boolean }): ClauseCheck {
  let nodes: TemplateNode[];
  try {
    nodes = parseTemplate(body);
  } catch (error) {
    return { errors: [(error as Error).message], placeholders: 0, conditions: 0 };
  }
  const errors: string[] = [];
  const byKey = new Map(fields.map((field) => [field.key, field]));
  for (const key of new Set([...templateKeys(nodes), ...placeholderKeys(body)])) {
    const field = byKey.get(key);
    if (!field && !BUILT_IN_PLACEHOLDERS.has(key)) {
      errors.push(`{{${key}}} isn’t a field or a built-in value`);
      continue;
    }
    // A field limited to other countries never has a value here.
    if (field?.jurisdictions && !field.jurisdictions.some((code) => chain.includes(code))) {
      errors.push(`{{${key}}} only applies in ${field.jurisdictions.join(", ")}`);
    }
  }
  // A printed value from another section would have no form field when that section is missing or removed.
  // (Conditions may test any field: a missing one is simply false.)
  const printed = printedKeys(nodes);
  for (const key of printed) {
    const field = byKey.get(key);
    if (field && field.sectionKey !== sectionKey && !SHARED_SECTIONS.has(field.sectionKey)) {
      errors.push(`{{${key}}} is printed from the ${field.sectionKey} section, which can be missing from a letter`);
    }
  }
  if (!allowHtml && /<\/?[a-z!][^>]*>/i.test(body)) errors.push("Raw HTML isn’t allowed: use the Markdown subset");
  const conditions = (body.match(/\{\{\s*#(if|unless)\b/g) ?? []).length;
  return { errors, placeholders: printed.size, conditions };
}

/**
 * Why a translated clause doesn't match the English clause it translates, or null when it does: it must print the
 * same values and test the same answers, so both versions of a letter say the same thing.
 */
export function translationMismatch(english: string, translation: string): string | null {
  let original: TemplateNode[];
  let translated: TemplateNode[];
  try {
    original = parseTemplate(english);
    translated = parseTemplate(translation);
  } catch (error) {
    return (error as Error).message;
  }
  const differences = (a: Set<string>, b: Set<string>) => [...a].filter((key) => !b.has(key)).map((key) => `{{${key}}}`);
  const printed = [printedKeys(original), printedKeys(translated)] as const;
  const tested = [templateKeys(original), templateKeys(translated)] as const;
  const missing = differences(printed[0], printed[1]);
  if (missing.length) return `the translation leaves out ${missing.join(", ")}`;
  const extra = differences(printed[1], printed[0]);
  if (extra.length) return `the translation prints ${extra.join(", ")}, which the English clause doesn’t`;
  const conditions = [...differences(tested[0], tested[1]), ...differences(tested[1], tested[0])];
  if (conditions.length) return `the translation’s conditions differ from the English clause’s (${conditions.join(", ")})`;
  return null;
}
