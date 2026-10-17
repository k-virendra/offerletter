import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import { checkClause } from "../src/lib/template/clause-check";
import {
  clauseFileSchema,
  fieldSchema,
  jurisdictionSchema,
  letterPhrasesSchema,
  priceSchema,
  sectionSchema,
  templateSchema,
  type ClauseFileContent,
  type FieldContent,
  type JurisdictionContent,
  type LetterPhrasesContent,
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

  return { jurisdictions, templates, sections, fields, prices, phrases, clauseFiles };
}
