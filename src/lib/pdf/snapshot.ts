import { createHash } from "node:crypto";
import type { LetterCompany, LetterContext, LetterState } from "@/lib/letter/types";

// What an issued version is made from, frozen at the moment of issue: the wording that was resolved for the
// country, the answers, the company's details and the letter date. The PDF of a version is rebuilt only from this,
// so later edits to clauses, the company or the draft never change a letter that was paid for.

export type IssuedCompany = Omit<LetterCompany, "logo"> & { logo: { path: string; width: number; height: number } | null };

export type IssuedSnapshot = {
  schema: 1;
  date: string;
  context: LetterContext;
  state: LetterState;
};

/** JSON with object keys sorted at every level, so equal content always gives the same text (and hash). */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
      .filter(([, v]) => v !== undefined)
      .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
    return `{${entries.map(([k, v]) => `${JSON.stringify(k)}:${canonicalJson(v)}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

export function contentHash(snapshot: IssuedSnapshot, company: IssuedCompany): string {
  return createHash("sha256").update(canonicalJson({ snapshot, company })).digest("hex");
}
