import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import { checkClause, translationMismatch } from "../src/lib/template/clause-check";
import {
  clauseFileSchema,
  fieldSchema,
  jurisdictionSchema,
  letterPhrasesSchema,
  planSchema,
  priceSchema,
  sectionSchema,
  templateSchema,
  type ClauseFileContent,
  type FieldContent,
  type JurisdictionContent,
  type LetterPhrasesContent,
  type PlanContent,
  type PriceContent,
  type SectionContent,
  type TemplateContent,
} from "../src/lib/content/schema";

// Loads and cross-checks everything in content/. Throws with a readable message on the first problem.

export interface Content {
  jurisdictions: JurisdictionContent[];
  templates: TemplateContent[];
  sections: SectionContent[];
  fields: FieldContent[];
  prices: PriceContent[];
  plans: PlanContent[];
  phrases: LetterPhrasesContent;
  clauseFiles: { file: string; content: ClauseFileContent }[];
}

const CONTENT_DIR = path.resolve(import.meta.dirname, "../content");

function readYaml<T>(file: string, schema: z.ZodType<T>): T {
  const raw: unknown = parse(readFileSync(path.join(CONTENT_DIR, file), "utf8"));
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new Error(`${file}: ${z.prettifyError(result.error)}`);
  }
  return result.data;
}

function unique<T>(items: T[], key: (item: T) => string, file: string) {
  const seen = new Set<string>();
  for (const item of items) {
    const k = key(item);
    if (seen.has(k)) throw new Error(`${file}: duplicate entry ${k}`);
    seen.add(k);
  }
}

export { BUILT_IN_PLACEHOLDERS, placeholderKeys } from "../src/lib/template/clause-check";

/** A jurisdiction and its parents, most specific first. */
export function jurisdictionChain(jurisdictions: JurisdictionContent[], code: string): string[] {
  const chain: string[] = [];
  let current = jurisdictions.find((j) => j.code === code);
  while (current && chain.length < 5) {
    chain.push(current.code);
    const parent = current.parent_code;
    current = parent ? jurisdictions.find((j) => j.code === parent) : undefined;
  }
  return chain;
}

export function loadContent(): Content {
  const jurisdictions = readYaml("jurisdictions.yaml", z.array(jurisdictionSchema));
  const templates = readYaml("templates.yaml", z.array(templateSchema));
  const sections = readYaml("sections.yaml", z.array(sectionSchema));
  const fields = readYaml("fields.yaml", z.array(fieldSchema));
  const prices = readYaml("prices.yaml", z.array(priceSchema));
  const plans = readYaml("plans.yaml", z.array(planSchema));
  unique(plans, (p) => p.key, "plans.yaml");
  const phrases = readYaml("letter-phrases.yaml", letterPhrasesSchema);

  unique(jurisdictions, (j) => j.code, "jurisdictions.yaml");
  unique(templates, (t) => t.key, "templates.yaml");
  unique(sections, (s) => s.key, "sections.yaml");
  unique(fields, (f) => f.key, "fields.yaml");

  const codes = new Set(jurisdictions.map((j) => j.code));
  for (const j of jurisdictions) {
    if (j.parent_code && !codes.has(j.parent_code)) {
      throw new Error(`jurisdictions.yaml: ${j.code} has unknown parent ${j.parent_code}`);
    }
  }
  const sectionKeys = new Set(sections.map((s) => s.key));
  for (const f of fields) {
    if (!sectionKeys.has(f.section_key)) throw new Error(`fields.yaml: ${f.key} uses unknown section ${f.section_key}`);
    for (const code of Object.keys(f.jurisdiction_overrides ?? {})) {
      if (!codes.has(code)) throw new Error(`fields.yaml: ${f.key} overrides unknown jurisdiction ${code}`);
    }
  }
  for (const purpose of ["display", "charge"] as const) {
    const active = prices.filter((p) => p.purpose === purpose && p.active);
    if (active.length !== 1) throw new Error(`prices.yaml: exactly one active ${purpose} price is needed, found ${active.length}`);
  }

  for (const code of Object.keys(phrases.overrides)) {
    if (!codes.has(code)) throw new Error(`letter-phrases.yaml: unknown jurisdiction ${code}`);
    for (const key of Object.keys(phrases.overrides[code] ?? {})) {
      if (!(key in phrases.defaults)) throw new Error(`letter-phrases.yaml: ${code} overrides unknown phrase ${key}`);
    }
  }

  const clauseDir = path.join(CONTENT_DIR, "clauses");
  const clauseFiles = readdirSync(clauseDir)
    .filter((name) => name.endsWith(".yaml"))
    .sort()
    .map((name) => {
      const file = `clauses/${name}`;
      const content = readYaml(file, clauseFileSchema);
      if (!codes.has(content.jurisdiction)) throw new Error(`${file}: unknown jurisdiction ${content.jurisdiction}`);
      unique(content.clauses, (c) => `${c.section}@${c.version}`, file);
      for (const clause of content.clauses) {
        if (!sectionKeys.has(clause.section)) throw new Error(`${file}: unknown section ${clause.section}`);
        const chain = jurisdictionChain(jurisdictions, content.jurisdiction);
        const fieldInfo = fields.map((f) => ({ key: f.key, sectionKey: f.section_key, jurisdictions: f.jurisdictions ?? null }));
        const check = checkClause(clause.body, { sectionKey: clause.section, fields: fieldInfo, chain });
        if (check.errors.length) throw new Error(`${file}: ${clause.section}: ${check.errors[0]}`);
      }
      return { file, content };
    });

  checkTranslations({ jurisdictions, sections, fields, phrases, clauseFiles });
  return { jurisdictions, templates, sections, fields, prices, plans, phrases, clauseFiles };
}

/** The newest version of each section's clause in one language for one jurisdiction. */
function latestClauses(clauseFiles: Content["clauseFiles"], jurisdiction: string, language: string) {
  const latest = new Map<string, ClauseFileContent["clauses"][number]>();
  for (const { content } of clauseFiles) {
    if (content.jurisdiction !== jurisdiction || content.language !== language) continue;
    for (const clause of content.clauses) {
      if ((latest.get(clause.section)?.version ?? 0) < clause.version) latest.set(clause.section, clause);
    }
  }
  return latest;
}

/** The answers a select field can print in a jurisdiction, after its country overrides. */
function selectOptions(field: FieldContent, chain: string[]): { value: string }[] {
  if (field.type !== "select") return [];
  if (field.jurisdictions?.length && !field.jurisdictions.some((code) => chain.includes(code))) return [];
  const overrides = (field.jurisdiction_overrides ?? {}) as Record<string, { options?: { value: string }[] }>;
  for (const code of chain) if (overrides[code]?.options) return overrides[code].options;
  return (field.options ?? []) as { value: string }[];
}

const phraseParts = (text: string) => [...text.matchAll(/\{\{(\w+)\}\}/g)].map((match) => match[1]).sort().join(",");

/**
 * Translations: a country with a `translation` has its English clauses translated section for section, printing the
 * same values; and the language's phrases cover everything such a letter prints.
 */
function checkTranslations({ jurisdictions, sections, fields, phrases, clauseFiles }: Omit<Content, "templates" | "prices" | "plans">) {
  for (const { file, content } of clauseFiles) {
    if (content.language === "en") continue;
    const jurisdiction = jurisdictions.find((j) => j.code === content.jurisdiction);
    if (jurisdiction?.translation?.language !== content.language) {
      throw new Error(`${file}: jurisdictions.yaml doesn’t give ${content.jurisdiction} a ${content.language} translation`);
    }
  }

  for (const jurisdiction of jurisdictions) {
    const language = jurisdiction.translation?.language;
    if (!language) continue;
    const file = `clauses/${jurisdiction.code.toLowerCase()}.${language}.yaml`;
    const english = latestClauses(clauseFiles, jurisdiction.code, "en");
    const translated = latestClauses(clauseFiles, jurisdiction.code, language);
    for (const [section, clause] of english) {
      const translation = translated.get(section);
      if (!translation) throw new Error(`${file}: ${section} has no ${language} translation`);
      const mismatch = translationMismatch(clause.body, translation.body);
      if (mismatch) throw new Error(`${file}: ${section}: ${mismatch}`);
    }
    for (const section of translated.keys()) {
      if (!english.has(section)) throw new Error(`${file}: ${section} has no English clause to translate`);
    }

    const texts = phrases.languages[language];
    if (!texts) throw new Error(`letter-phrases.yaml: languages.${language} is missing (${jurisdiction.code} letters are translated)`);
    const chain = jurisdictionChain(jurisdictions, jurisdiction.code);
    const needed = [
      ...Object.keys(phrases.defaults),
      "translation_notice",
      ...[...translated.keys()].map((section) => `section.${section}`),
      ...fields.flatMap((field) => selectOptions(field, chain).map((option) => `option.${field.key}.${option.value}`)),
    ];
    for (const key of needed) if (!texts[key]) throw new Error(`letter-phrases.yaml: languages.${language} needs ${key} for ${jurisdiction.code} letters`);
  }

  const sectionKeys = new Set(sections.map((section) => section.key));
  const fieldKeys = new Set(fields.map((field) => field.key));
  for (const [language, texts] of Object.entries(phrases.languages)) {
    if (!jurisdictions.some((j) => j.translation?.language === language)) throw new Error(`letter-phrases.yaml: no country is translated into ${language}`);
    for (const [key, text] of Object.entries(texts)) {
      const section = key.match(/^section\.([a-z_]+)(\.short)?$/)?.[1];
      const option = key.match(/^option\.([a-z_]+\.[a-z_]+)\./)?.[1];
      const known = key in phrases.defaults || key === "translation_notice" || (section && sectionKeys.has(section)) || (option && fieldKeys.has(option));
      if (!known) throw new Error(`letter-phrases.yaml: languages.${language}.${key} isn’t a phrase, section title or answer`);
      const english = phrases.defaults[key];
      if (english !== undefined && phraseParts(english) !== phraseParts(text)) {
        throw new Error(`letter-phrases.yaml: languages.${language}.${key} must use the same {{…}} parts as the English phrase`);
      }
    }
  }
}
