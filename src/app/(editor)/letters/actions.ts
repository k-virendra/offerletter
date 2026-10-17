"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { getUser } from "@/lib/auth";
import { normalizeHex } from "@/lib/color";
import { loadLetterContext } from "@/lib/letter/context.server";
import { moveToJurisdiction, sanitizeValues } from "@/lib/letter/fields";
import { changedLockedField } from "@/lib/letter/corrections";
import { correctionOpen, letterState } from "@/lib/letter/letters.server";
import { DEFAULT_LETTER_NAME } from "@/lib/letter/naming";
import type { FieldValues } from "@/lib/letter/types";
import { letterWording } from "@/lib/pdf/inputs.server";
import { takeRateLimit } from "@/lib/rate-limit";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";

const uuid = z.uuid();

export type CreateLetterResult = { ok: false; message: string };

/** Starts a draft for one of the user's companies, with the company's signatory and the fields' defaults. */
export async function createLetter(formData: FormData): Promise<CreateLetterResult> {
  const user = await getUser();
  if (!user) return { ok: false, message: "Your session has ended. Sign in again to start a letter." };
  if (!(await takeRateLimit(`letter-create:${user.id}`, 600, 30))) {
    return { ok: false, message: "You’ve started a lot of letters in a short time. Wait a few minutes, then try again." };
  }

  const companyId = uuid.safeParse(formData.get("company_id"));
  const jurisdictionCode = String(formData.get("jurisdiction_code") ?? "");
  const templateKey = String(formData.get("template_key") ?? "");
  if (!companyId.success) return { ok: false, message: "Choose a company for this letter." };

  const context = await loadLetterContext(jurisdictionCode);
  if (!context || !context.clauses.candidate) return { ok: false, message: "Letters for this country aren’t available yet. Choose another country." };
  if (!context.templates.some((t) => t.key === templateKey)) return { ok: false, message: "Choose a letter style." };

  const supabase = await createClient();
  const { data: company } = await supabase
    .from("companies")
    .select("id, archived_at, suspended_at, signatory_name, signatory_title")
    .eq("id", companyId.data)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (!company) return { ok: false, message: "We couldn’t find this company. Choose another one." };
  if (company.suspended_at) return { ok: false, message: "New letters for this company are paused. Contact support to find out more." };
  if (company.archived_at) return { ok: false, message: "This company is archived. Restore it in My companies to use it again." };

  const values: FieldValues = {};
  for (const field of context.fields) if (field.defaultValue !== null) values[field.key] = field.defaultValue;
  values["signatory.name"] = company.signatory_name;
  values["signatory.title"] = company.signatory_title;

  const { data: letter, error } = await supabase
    .from("letters")
    .insert({
      company_id: company.id,
      author_id: user.id,
      jurisdiction_code: context.jurisdiction.code,
      template_key: templateKey,
      name: DEFAULT_LETTER_NAME,
      field_values: values,
    })
    .select("id")
    .single();
  if (error || !letter) {
    console.error("createLetter failed", error?.code, error?.message);
    if (error?.message === "company_suspended") return { ok: false, message: "New letters for this company are paused." };
    return { ok: false, message: "We couldn’t start the letter. Try again in a moment." };
  }
  redirect(`/letters/${letter.id}/edit`);
}

const patchSchema = z.strictObject({
  name: z.string().trim().min(1).max(200).optional(),
  templateKey: z.string().max(40).optional(),
  accentColor: z.string().nullable().optional(),
  removedSections: z.array(z.string().max(60)).max(50).optional(),
  values: z.record(z.string(), z.unknown()).optional(),
});

export type DraftPatch = z.input<typeof patchSchema>;

export type SaveDraftResult =
  | { ok: true; editedAt: string }
  | { ok: false; reason: "conflict" | "locked" | "gone" | "invalid" | "signed_out" | "busy" | "error"; message: string };

/**
 * Autosave. Sends only what changed, with the edited_at the browser last saw: if the letter changed elsewhere in
 * the meantime (another tab), nothing is overwritten and the editor asks to reload.
 */
export async function saveDraft(letterId: string, baseEditedAt: string, patch: DraftPatch): Promise<SaveDraftResult> {
  const user = await getUser();
  if (!user) return { ok: false, reason: "signed_out", message: "Your session has ended. Sign in again; your changes are kept in this browser." };
  if (!uuid.safeParse(letterId).success) return { ok: false, reason: "gone", message: "We couldn’t find this letter." };
  if (!(await takeRateLimit(`draft-save:${user.id}`, 600, 600))) return { ok: false, reason: "busy", message: "Saving paused for a moment. Retry shortly." };

  const parsed = patchSchema.safeParse(patch);
  if (!parsed.success) return { ok: false, reason: "invalid", message: "Some changes couldn’t be saved." };

  const supabase = await createClient();
  const { data: letter } = await supabase
    .from("letters")
    .select("id, status, author_id, jurisdiction_code, current_version, correction_until, field_values")
    .eq("id", letterId)
    .eq("author_id", user.id)
    .maybeSingle();
  if (!letter) return { ok: false, reason: "gone", message: "We couldn’t find this letter. It may have been deleted." };
  // A paid letter is saved only as a free correction, by its author, inside the correction window.
  const correcting = letter.status === "paid";
  if (correcting && (letter.author_id !== user.id || !correctionOpen(letter))) {
    return { ok: false, reason: "gone", message: "The free correction period for this letter has ended, so it can’t be changed." };
  }

  const wording = await letterWording(letter);
  if (!wording) return { ok: false, reason: "invalid", message: "Letters for this country aren’t available any more." };
  const { context } = wording;

  const update: { name?: string; template_key?: string; accent_color?: string | null; removed_sections?: string[]; field_values?: FieldValues } = {};
  const { name, templateKey, accentColor, removedSections, values } = parsed.data;
  if (name !== undefined) update.name = name;
  if (templateKey !== undefined) {
    if (!context.templates.some((t) => t.key === templateKey)) return { ok: false, reason: "invalid", message: "That letter style isn’t available." };
    update.template_key = templateKey;
  }
  if (accentColor !== undefined) update.accent_color = accentColor === null ? null : normalizeHex(accentColor);
  if (removedSections !== undefined) {
    const known = new Set(context.sections.map((s) => s.key));
    update.removed_sections = [...new Set(removedSections.filter((key) => known.has(key)))];
  }
  if (values !== undefined) {
    update.field_values = sanitizeValues(context.fields, values);
    if (correcting && changedLockedField(letter.field_values as FieldValues, update.field_values)) {
      return { ok: false, reason: "invalid", message: "The candidate’s name and the job title can’t change in a correction." };
    }
  }

  // Drafts are saved as the user (RLS allows drafts only); corrections by the server, after the checks above.
  const query = (correcting ? adminClient() : supabase).from("letters").update(update).eq("id", letterId).eq("status", letter.status).eq("edited_at", baseEditedAt);
  const { data: saved, error } = await (correcting ? query.gt("correction_until", new Date().toISOString()) : query).select("edited_at").maybeSingle();
  if (error?.message === "section_locked") {
    return { ok: false, reason: "locked", message: "That section is required in this country, so it stays in the letter." };
  }
  if (error) {
    console.error("saveDraft failed", error.code, error.message);
    return { ok: false, reason: "error", message: "We couldn’t save your last change." };
  }
  if (!saved) return { ok: false, reason: "conflict", message: "This letter was changed in another tab or window." };
  return { ok: true, editedAt: saved.edited_at };
}

export type ChangeCountryResult =
  | { ok: true; name: string; dropped: string[] }
  | { ok: false; reason: "conflict" | "invalid" | "gone" | "signed_out"; message: string };

/**
 * Moves a draft to another country or state: its sections are resolved again, answers the new country still asks
 * for are kept, and sections it requires come back. Returns the labels of answers that no longer apply.
 */
export async function changeLetterCountry(letterId: string, baseEditedAt: string, jurisdictionCode: string): Promise<ChangeCountryResult> {
  const user = await getUser();
  if (!user) return { ok: false, reason: "signed_out", message: "Your session has ended. Sign in again to change the country." };
  if (!uuid.safeParse(letterId).success) return { ok: false, reason: "gone", message: "We couldn’t find this letter." };

  const supabase = await createClient();
  const { data: letter } = await supabase
    .from("letters")
    .select("status, jurisdiction_code, template_key, name, accent_color, field_values, removed_sections, edited_at")
    .eq("id", letterId)
    .eq("author_id", user.id)
    .maybeSingle();
  if (!letter || letter.status !== "draft") return { ok: false, reason: "gone", message: "Only draft letters can change country." };
  if (letter.edited_at !== baseEditedAt) {
    return { ok: false, reason: "conflict", message: "This letter was changed in another tab or window. Reload it first." };
  }

  const [current, next] = await Promise.all([loadLetterContext(letter.jurisdiction_code), loadLetterContext(jurisdictionCode)]);
  if (!next || !next.clauses.candidate) return { ok: false, reason: "invalid", message: "Letters for this country aren’t available yet." };
  const { name: placeName, countryName } = next.jurisdiction;
  const name = placeName === countryName ? placeName : `${countryName}, ${placeName}`;
  if (letter.jurisdiction_code === jurisdictionCode) return { ok: true, name, dropped: [] };

  const { state, dropped } = moveToJurisdiction(next, letterState(letter));
  const templateKey = next.templates.some((t) => t.key === state.templateKey) ? state.templateKey : (next.templates[0]?.key ?? state.templateKey);
  const { data: saved, error } = await supabase
    .from("letters")
    .update({
      jurisdiction_code: next.jurisdiction.code,
      field_values: sanitizeValues(next.fields, state.values),
      removed_sections: state.removedSections,
      template_key: templateKey,
    })
    .eq("id", letterId)
    .eq("status", "draft")
    .eq("edited_at", baseEditedAt)
    .select("edited_at")
    .maybeSingle();
  if (error) {
    console.error("changeLetterCountry failed", error.code, error.message);
    return { ok: false, reason: "invalid", message: "We couldn’t change the country. Try again in a moment." };
  }
  if (!saved) return { ok: false, reason: "conflict", message: "This letter was changed in another tab or window. Reload it first." };
  return { ok: true, name, dropped: dropped.map((key) => current?.fields.find((f) => f.key === key)?.label ?? key) };
}
