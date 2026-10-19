"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adminActor, NOT_ADMIN, type AdminResult } from "@/lib/admin/auth";
import { checkClause, translationMismatch } from "@/lib/template/clause-check";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

// The clause review workflow: draft → in review → approved. Only drafts can be edited; an approved clause never
// changes (a change is a new version, which starts as a draft). The database enforces the same rules.

const refresh = () => {
  revalidatePath("/admin/clauses");
  revalidatePath("/admin");
  revalidatePath("/admin/countries");
};

async function chainFor(code: string): Promise<string[]> {
  const supabase = await createClient();
  const { data } = await supabase.rpc("jurisdiction_chain", { p_code: code });
  return data ?? [code];
}

async function fieldInfo() {
  const supabase = await createClient();
  const { data } = await supabase.from("field_definitions").select("key, section_key, jurisdictions");
  return (data ?? []).map((f) => ({ key: f.key, sectionKey: f.section_key, jurisdictions: f.jurisdictions }));
}

export type CreateClauseResult = { ok: true; id: string } | { ok: false; message: string };

/** The latest version of a section's clause in a country and language, read with the secret key (legal notes). */
async function latestClause(sectionKey: string, jurisdictionCode: string, language: string) {
  const { data } = await adminClient()
    .from("clause_variants")
    .select("version, title, body, locked, locked_reason, editor_help, legal_notes")
    .eq("section_key", sectionKey)
    .eq("jurisdiction_code", jurisdictionCode)
    .eq("language", language)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data;
}

/**
 * A new draft version for a section in a country, starting from its latest version (or a blank clause). A first
 * translation starts from the English text, to translate in place.
 */
export async function createClauseVersion(sectionKey: string, jurisdictionCode: string, language = "en"): Promise<CreateClauseResult> {
  const actor = await adminActor();
  if (!actor) return NOT_ADMIN as CreateClauseResult;
  if (!/^[a-z]{2}$/.test(language)) return { ok: false, message: "Unknown language." };
  const supabase = await createClient();
  const own = await latestClause(sectionKey, jurisdictionCode, language);
  const english = language === "en" || own ? null : await latestClause(sectionKey, jurisdictionCode, "en");
  const latest = own ?? (english ? { ...english, version: 0, locked: false, locked_reason: null } : null);
  const { data, error } = await supabase
    .from("clause_variants")
    .insert({
      section_key: sectionKey,
      jurisdiction_code: jurisdictionCode,
      language,
      version: (latest?.version ?? 0) + 1,
      title: latest?.title ?? null,
      body: latest?.body ?? "Write the clause here.",
      locked: latest?.locked ?? false,
      locked_reason: latest?.locked_reason ?? null,
      editor_help: latest?.editor_help ?? null,
      legal_notes: latest?.legal_notes ?? null,
      review_status: "draft",
      created_by: actor.id,
      source_file: null,
    })
    .select("id")
    .single();
  if (error || !data) {
    console.error("createClauseVersion failed", error?.message);
    return { ok: false, message: error?.code === "23505" ? "Someone just added this version. Reload the page." : "The new version couldn’t be created." };
  }
  refresh();
  return { ok: true, id: data.id };
}

const clauseSchema = z.object({
  title: z.string().trim().max(120),
  body: z.string().trim().min(1, "The clause text can’t be empty.").max(20000),
  locked: z.boolean(),
  lockedReason: z.string().trim().max(120),
  editorHelp: z.string().trim().max(500),
  legalNotes: z.string().trim().max(5000),
});

export type ClauseInput = z.input<typeof clauseSchema>;

export async function saveClause(id: string, input: ClauseInput): Promise<AdminResult> {
  if (!(await adminActor())) return NOT_ADMIN;
  const parsed = clauseSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the clause." };
  const { title, body, locked, lockedReason, editorHelp, legalNotes } = parsed.data;
  if (locked && !lockedReason) return { ok: false, message: "Say why the section is required, e.g. “Required in Australia”." };

  const supabase = await createClient();
  const { data: clause } = await supabase.from("clause_variants").select("section_key, jurisdiction_code, language, review_status").eq("id", id).maybeSingle();
  if (!clause) return { ok: false, message: "This clause no longer exists." };
  if (clause.review_status !== "draft") return { ok: false, message: "Only drafts can be edited. Send it back to draft first, or start a new version." };
  const check = checkClause(body, { sectionKey: clause.section_key, fields: await fieldInfo(), chain: await chainFor(clause.jurisdiction_code) });
  if (check.errors.length) return { ok: false, message: `Fix the clause text first: ${check.errors[0]}.` };
  // A translation says what the English clause says: the same values and conditions.
  if (clause.language !== "en") {
    const english = await latestClause(clause.section_key, clause.jurisdiction_code, "en");
    const mismatch = english ? translationMismatch(english.body, body) : "there’s no English clause for this section to translate";
    if (mismatch) return { ok: false, message: `Fix the translation first: ${mismatch}.` };
  }

  const { error } = await supabase
    .from("clause_variants")
    .update({
      title: title || null,
      body,
      locked,
      locked_reason: locked ? lockedReason : null,
      editor_help: editorHelp || null,
      legal_notes: legalNotes || null,
      // Edited here now: seeding from content/ leaves it alone.
      source_file: null,
    })
    .eq("id", id)
    .eq("review_status", "draft");
  if (error) {
    console.error("saveClause failed", error.message);
    return { ok: false, message: "The clause couldn’t be saved." };
  }
  refresh();
  return { ok: true, message: "Draft saved." };
}

export async function setClauseStatus(id: string, status: "draft" | "in_review"): Promise<AdminResult> {
  if (!(await adminActor())) return NOT_ADMIN;
  const supabase = await createClient();
  const from = status === "in_review" ? "draft" : "in_review";
  const { data, error } = await supabase.from("clause_variants").update({ review_status: status }).eq("id", id).eq("review_status", from).select("id").maybeSingle();
  if (error || !data) {
    if (error) console.error("setClauseStatus failed", error.message);
    return { ok: false, message: status === "in_review" ? "Only a draft can be sent for review." : "Only a clause in review can go back to draft." };
  }
  refresh();
  return { ok: true, message: status === "in_review" ? "Sent for review. It can’t be edited until it’s approved or sent back." : "Back to draft: it can be edited again." };
}

const approvalSchema = z.object({
  reviewer: z.string().trim().min(3, "Name the reviewer (and their firm).").max(200),
  reviewedOn: z.iso.date({ message: "Enter the review date." }),
});

export async function approveClause(id: string, input: z.input<typeof approvalSchema>): Promise<AdminResult> {
  if (!(await adminActor())) return NOT_ADMIN;
  const parsed = approvalSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? "Check the review details." };
  const reviewedAt = new Date(`${parsed.data.reviewedOn}T12:00:00Z`);
  if (reviewedAt.getTime() > Date.now() + 86_400_000) return { ok: false, message: "The review date can’t be in the future." };

  const supabase = await createClient();
  // A translation is approved only while it still matches the latest English clause.
  const { data: clause } = await supabase.from("clause_variants").select("section_key, jurisdiction_code, language, body").eq("id", id).maybeSingle();
  if (clause && clause.language !== "en") {
    const english = await latestClause(clause.section_key, clause.jurisdiction_code, "en");
    const mismatch = english ? translationMismatch(english.body, clause.body) : "there’s no English clause for this section to translate";
    if (mismatch) return { ok: false, message: `This translation doesn’t match the English clause: ${mismatch}. Send it back to draft and update it.` };
  }
  const { data, error } = await supabase
    .from("clause_variants")
    .update({ review_status: "approved", reviewer: parsed.data.reviewer, reviewed_at: reviewedAt.toISOString() })
    .eq("id", id)
    .eq("review_status", "in_review")
    .select("version")
    .maybeSingle();
  if (error || !data) {
    if (error) console.error("approveClause failed", error.message);
    return { ok: false, message: "Only a clause in review can be approved." };
  }
  refresh();
  return { ok: true, message: `Version ${data.version} approved. New letters use it from now on.` };
}

export async function deleteDraft(id: string): Promise<AdminResult> {
  if (!(await adminActor())) return NOT_ADMIN;
  const supabase = await createClient();
  const { data, error } = await supabase.from("clause_variants").delete().eq("id", id).eq("review_status", "draft").select("id").maybeSingle();
  if (error || !data) {
    if (error) console.error("deleteDraft failed", error.message);
    return { ok: false, message: "Only drafts can be deleted." };
  }
  refresh();
  return { ok: true, message: "Draft deleted." };
}
