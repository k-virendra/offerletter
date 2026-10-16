import "server-only";
import { cache } from "react";
import { allowUnreviewedClauses } from "@/lib/env.server";
import { adminClient } from "@/lib/supabase/admin";
import { resolveClauses, resolveFields, resolvePhrases } from "./resolve";
import type { LetterContext } from "./types";

// Reference data for letters. It's the same for every user, so it's read with the secret key, column by column
// (legal notes are never selected). Production uses approved clauses and enabled countries only; local
// development may add drafts (ALLOW_UNREVIEWED_CLAUSES), shown with an "Unreviewed wording" banner.

export type JurisdictionOption = {
  code: string;
  name: string;
  parentCode: string | null;
  currency: string;
  locale: string;
  paperSize: "a4" | "letter";
  selectable: boolean;
  /** Why it can't be chosen yet, e.g. no wording for it. */
  unavailable: string | null;
  /** Shown when choosing it, e.g. which states have their own wording. */
  publicNote: string | null;
};

/** Countries and their states or provinces for the New letter screen. */
export const listJurisdictions = cache(async (): Promise<JurisdictionOption[]> => {
  const db = adminClient();
  const unreviewed = allowUnreviewedClauses();
  const [{ data: rows }, { data: openings }] = await Promise.all([
    db.from("jurisdictions").select("code, name, parent_code, currency, locale, paper_size, enabled, selectable, sort_order, public_note").order("sort_order"),
    // A country has wording when it (or its parent) has an opening clause that may be used.
    db.from("clause_variants").select("jurisdiction_code, review_status").eq("section_key", "candidate").eq("language", "en"),
  ]);
  const withOpening = new Set((openings ?? []).filter((c) => unreviewed || c.review_status === "approved").map((c) => c.jurisdiction_code));
  const byCode = new Map((rows ?? []).map((row) => [row.code, row]));
  return (rows ?? [])
    .filter((row) => row.enabled || unreviewed)
    .map((row) => {
      const hasWording = withOpening.has(row.code) || (row.parent_code !== null && withOpening.has(row.parent_code));
      const parentEnabled = !row.parent_code || byCode.get(row.parent_code)?.enabled || unreviewed;
      return {
        code: row.code,
        name: row.name,
        parentCode: row.parent_code,
        currency: row.currency,
        locale: row.locale,
        paperSize: row.paper_size,
        selectable: row.selectable,
        // A state or province that can't be chosen on its own (Quebec) says why in its note.
        unavailable:
          row.parent_code && !row.selectable
            ? (row.public_note ?? "Not available yet")
            : !parentEnabled
              ? "Not available yet"
              : hasWording
                ? null
                : "Wording for this country is still being written",
        publicNote: row.public_note,
      };
    });
});

/** Everything needed to build letters for one jurisdiction, or null when it can't be used. */
export const loadLetterContext = cache(async (jurisdictionCode: string): Promise<LetterContext | null> => {
  const db = adminClient();
  const unreviewed = allowUnreviewedClauses();

  const { data: chainCodes } = await db.rpc("jurisdiction_chain", { p_code: jurisdictionCode });
  if (!chainCodes?.length) return null;

  const [jurisdictions, sections, clauses, fields, templates, phrases] = await Promise.all([
    db.from("jurisdictions").select("code, name, currency, locale, paper_size, enabled, selectable").in("code", chainCodes),
    db.from("sections").select("key, default_title, short_title, default_order, always_included, show_heading, varies_by_country, help_text").order("default_order"),
    db
      .from("clause_variants")
      .select("id, section_key, jurisdiction_code, title, body, locked, locked_reason, editor_help, review_status, version")
      .in("jurisdiction_code", chainCodes)
      .eq("language", "en"),
    db
      .from("field_definitions")
      .select("key, section_key, label, type, required, options, validation, help_text, placeholder, default_value, sort_order, jurisdictions, jurisdiction_overrides"),
    db.from("templates").select("key, name, description, default_accent").eq("active", true).order("sort_order"),
    db.from("letter_phrases").select("key, jurisdiction_code, text").eq("language", "en").or(`jurisdiction_code.is.null,jurisdiction_code.in.(${chainCodes.join(",")})`),
  ]);
  for (const result of [jurisdictions, sections, clauses, fields, templates, phrases]) {
    if (result.error) throw new Error(`Letter content couldn't be loaded: ${result.error.message}`);
  }

  const own = jurisdictions.data?.find((j) => j.code === jurisdictionCode);
  // Quebec (not selectable) never gets letters, even in development; switched-off countries only locally.
  if (!own || !own.selectable || (!unreviewed && !own.enabled)) return null;
  const chain = chainCodes.map((code) => ({ code, name: jurisdictions.data?.find((j) => j.code === code)?.name ?? code }));

  return {
    jurisdiction: {
      code: own.code,
      name: own.name,
      countryName: chain.at(-1)?.name ?? own.name,
      currency: own.currency,
      locale: own.locale,
      paperSize: own.paper_size,
    },
    sections: (sections.data ?? []).map((s) => ({
      key: s.key,
      title: s.default_title,
      shortTitle: s.short_title ?? s.default_title,
      order: s.default_order,
      alwaysIncluded: s.always_included,
      showHeading: s.show_heading,
      variesByCountry: s.varies_by_country,
      help: s.help_text,
    })),
    clauses: resolveClauses(clauses.data ?? [], chain, unreviewed),
    fields: resolveFields(fields.data ?? [], chain),
    templates: (templates.data ?? []).map((t) => ({ key: t.key, name: t.name, description: t.description, defaultAccent: t.default_accent })),
    phrases: resolvePhrases(phrases.data ?? [], chain),
  };
});
