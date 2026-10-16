import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { parse } from "yaml";
import { z } from "zod";
import { parseTemplate, placeholderKeys as printedKeys, templateKeys, type TemplateNode } from "../src/lib/template/parse";
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

// {{field.key}}, {{#if field.key}} and {{/if}} placeholders in clause text.
export function placeholderKeys(body: string): string[] {
  const keys = new Set<string>();
  for (const match of body.matchAll(/\{\{\s*([^{}]*?)\s*\}\}/g)) {
    for (const key of match[1]?.match(/[a-z][a-z0-9_]*(?:\.[a-z][a-z0-9_]*)+/g) ?? []) keys.add(key);
  }
  return [...keys];
}

// Values every clause may use that are not form fields (company details, dates, derived amounts).
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

/** Sections whose fields any clause may use: they are in every letter and can't be removed. */
const SHARED_SECTIONS = new Set(["candidate", "position", "compensation", "acceptance"]);

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

  const fieldKeys = new Set(fields.map((f) => f.key));
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
        let nodes: TemplateNode[];
        try {
          nodes = parseTemplate(clause.body);
        } catch (error) {
          throw new Error(`${file}: ${clause.section}: ${(error as Error).message}`);
        }
        const chain = jurisdictionChain(jurisdictions, content.jurisdiction);
        for (const key of new Set([...templateKeys(nodes), ...placeholderKeys(clause.body)])) {
          if (!fieldKeys.has(key) && !BUILT_IN_PLACEHOLDERS.has(key)) {
            throw new Error(`${file}: ${clause.section} uses unknown placeholder {{${key}}}`);
          }
          // A field limited to other countries never has a value here.
          const field = fields.find((f) => f.key === key);
          if (field?.jurisdictions && !field.jurisdictions.some((code) => chain.includes(code))) {
            throw new Error(`${file}: ${clause.section} uses {{${key}}}, which only applies in ${field.jurisdictions.join(", ")}`);
          }
        }
        // A printed value from another section would have no form field when that section is missing or removed.
        // (Conditions may test any field: a missing one is simply false.)
        for (const key of printedKeys(nodes)) {
          const field = fields.find((f) => f.key === key);
          if (field && field.section_key !== clause.section && !SHARED_SECTIONS.has(field.section_key)) {
            throw new Error(`${file}: ${clause.section} prints {{${key}}} from the ${field.section_key} section`);
          }
        }
      }
      return { file, content };
    });

  return { jurisdictions, templates, sections, fields, prices, phrases, clauseFiles };
}
