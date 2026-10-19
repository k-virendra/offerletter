import { loadContent } from "../../../scripts/content";
import { resolveClauses, resolveFields, resolvePhrases, type ClauseRow } from "./resolve";
import { translateContext } from "./translation";
import type { LetterContext } from "./types";

// Test helpers: a LetterContext built straight from content/ (as the server would after seeding, with draft
// clauses allowed), plus the fictional sample companies from the design canvas.

const content = loadContent();

export function chainFor(code: string): { code: string; name: string }[] {
  const chain: { code: string; name: string }[] = [];
  let current = content.jurisdictions.find((j) => j.code === code);
  while (current) {
    chain.push({ code: current.code, name: current.name });
    const parent = current.parent_code;
    current = parent ? content.jurisdictions.find((j) => j.code === parent) : undefined;
  }
  return chain;
}

export function contextFor(code: string, { allowUnreviewed = true, approve = false } = {}): LetterContext {
  const chain = chainFor(code);
  const jurisdiction = content.jurisdictions.find((j) => j.code === code)!;
  const clauseRows: ClauseRow[] = clauseRowsFor("en", approve);
  const phraseRows = [
    ...Object.entries(content.phrases.defaults).map(([key, text]) => ({ key, jurisdiction_code: null, text })),
    ...Object.entries(content.phrases.overrides).flatMap(([c, phrases]) => Object.entries(phrases).map(([key, text]) => ({ key, jurisdiction_code: c, text }))),
  ];
  return {
    jurisdiction: {
      code,
      name: jurisdiction.name,
      countryName: chain.at(-1)!.name,
      currency: jurisdiction.currency,
      locale: jurisdiction.locale,
      paperSize: jurisdiction.paper_size,
      ...(jurisdiction.translation ? { translation: jurisdiction.translation } : {}),
    },
    sections: content.sections
      .map((s) => ({
        key: s.key,
        title: s.default_title,
        shortTitle: s.short_title ?? s.default_title,
        order: s.default_order,
        alwaysIncluded: s.always_included ?? false,
        showHeading: s.show_heading ?? true,
        variesByCountry: s.varies_by_country ?? false,
        help: s.help_text ?? null,
      }))
      .sort((a, b) => a.order - b.order),
    clauses: resolveClauses(clauseRows, chain, allowUnreviewed),
    fields: resolveFields(
      content.fields.map((f) => ({
        key: f.key,
        section_key: f.section_key,
        label: f.label,
        type: f.type,
        required: f.required ?? false,
        options: f.options ?? null,
        validation: f.validation ?? {},
        help_text: f.help_text ?? null,
        placeholder: f.placeholder ?? null,
        sort_order: f.sort_order,
        default_value: f.default_value ?? null,
        jurisdictions: f.jurisdictions ?? null,
        jurisdiction_overrides: f.jurisdiction_overrides ?? {},
      })),
      chain,
    ),
    templates: content.templates.map((t) => ({ key: t.key, name: t.name, description: t.description, defaultAccent: t.default_accent })),
    phrases: resolvePhrases(phraseRows, chain),
  };
}

/** A jurisdiction's translated wording (Germany: German), as the server builds it from the same content. */
export function translatedContextFor(code: string, { allowUnreviewed = true, approve = false } = {}): LetterContext {
  const english = contextFor(code, { allowUnreviewed, approve });
  const translation = english.jurisdiction.translation;
  if (!translation) throw new Error(`${code} has no translation`);
  const phrases = content.phrases.languages[translation.language] ?? {};
  return translateContext(english, {
    ...translation,
    clauses: resolveClauses(clauseRowsFor(translation.language, approve), chainFor(code), allowUnreviewed),
    phrases,
  });
}

function clauseRowsFor(language: string, approve: boolean): ClauseRow[] {
  return content.clauseFiles
    .filter(({ content: file }) => file.language === language)
    .flatMap(({ content: file }) =>
      file.clauses.map((clause, index) => ({
        id: `${file.jurisdiction}-${file.language}-${clause.section}-${index}`,
        section_key: clause.section,
        jurisdiction_code: file.jurisdiction,
        title: clause.title ?? null,
        body: clause.body,
        locked: clause.locked,
        locked_reason: clause.locked_reason ?? null,
        editor_help: clause.editor_help ?? null,
        review_status: approve ? "approved" : "draft",
        version: clause.version,
      })),
    );
}

export { EXAMPLE_ENGINEERING, LENA_VALUES } from "./samples";
