"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adminActor, auditAs, NOT_ADMIN, type AdminResult } from "@/lib/admin/auth";
import { normalizeHex } from "@/lib/color";
import { sendEmail } from "@/lib/email/send.server";
import { appUrl } from "@/lib/payu/gateway.server";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { BRAND } from "@/lib/brand";

// Admin changes to countries, styles, prices, companies, misuse reports and payments. Each one checks the admin
// role first; writes go through the admin's session (RLS + guard triggers) except payments, which only the
// server may change, and are logged with the admin's name by hand.

const done = (paths: string[], message?: string): AdminResult => {
  for (const path of paths) revalidatePath(path);
  return { ok: true, message };
};
const failed = (message: string, error?: { message: string } | null): AdminResult => {
  if (error) console.error("admin action failed", error.message);
  return { ok: false, message };
};

// --- Countries ------------------------------------------------------------------------------------------------

export async function setCountryEnabled(code: string, enabled: boolean): Promise<AdminResult> {
  if (!(await adminActor())) return NOT_ADMIN;
  const supabase = await createClient();
  const { data, error } = await supabase.from("jurisdictions").update({ enabled }).eq("code", code).select("name").maybeSingle();
  if (error?.message === "jurisdiction_not_ready") {
    return { ok: false, message: `Can’t switch it on yet. ${error.details ?? "Some required sections need an approved clause."}` };
  }
  if (error || !data) return failed("The country couldn’t be changed.", error);
  return done(["/admin", "/admin/countries"], `${data.name} is ${enabled ? "on: people can write letters for it" : "off"}.`);
}

const countryNotes = z.object({ publicNote: z.string().trim().max(300), adminNotes: z.string().trim().max(2000) });

export async function saveCountryNotes(code: string, input: z.input<typeof countryNotes>): Promise<AdminResult> {
  if (!(await adminActor())) return NOT_ADMIN;
  const parsed = countryNotes.safeParse(input);
  if (!parsed.success) return failed("The public note can be at most 300 characters.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("jurisdictions")
    .update({ public_note: parsed.data.publicNote || null, admin_notes: parsed.data.adminNotes || null })
    .eq("code", code);
  if (error) return failed("The notes couldn’t be saved.", error);
  return done(["/admin/countries"], "Notes saved.");
}

// --- Letter styles --------------------------------------------------------------------------------------------

const styleSchema = z.object({
  name: z.string().trim().min(1, "Give the style a name.").max(60),
  description: z.string().trim().max(300),
  defaultAccent: z.string(),
  sortOrder: z.coerce.number().int().min(0).max(1000),
});

export async function saveStyle(key: string, input: z.input<typeof styleSchema>): Promise<AdminResult> {
  if (!(await adminActor())) return NOT_ADMIN;
  const parsed = styleSchema.safeParse(input);
  if (!parsed.success) return failed(parsed.error.issues[0]?.message ?? "Check the style’s details.");
  const accent = normalizeHex(parsed.data.defaultAccent);
  if (!accent) return failed("The default colour must be a hex colour like #1F4E8C.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("templates")
    .update({ name: parsed.data.name, description: parsed.data.description || null, default_accent: accent, sort_order: parsed.data.sortOrder })
    .eq("key", key);
  if (error) return failed("The style couldn’t be saved.", error);
  return done(["/admin/styles"], `${parsed.data.name} saved.`);
}

export async function setStyleActive(key: string, active: boolean): Promise<AdminResult> {
  if (!(await adminActor())) return NOT_ADMIN;
  const supabase = await createClient();
  if (!active) {
    const { count } = await supabase.from("templates").select("key", { count: "exact", head: true }).eq("active", true).neq("key", key);
    if (!count) return failed("At least one style must stay on.");
  }
  const { data, error } = await supabase.from("templates").update({ active }).eq("key", key).select("name").maybeSingle();
  if (error || !data) return failed("The style couldn’t be changed.", error);
  return done(["/admin/styles"], active ? `${data.name} is on.` : `${data.name} is off. Letters that use it keep it.`);
}

// --- Prices ---------------------------------------------------------------------------------------------------

const priceSchema = z.object({
  purpose: z.enum(["display", "charge"]),
  currency: z.string().trim().toUpperCase().regex(/^[A-Z]{3}$/, "Use a three-letter currency code, like INR."),
  amount: z.string().trim().regex(/^\d{1,7}(\.\d{1,2})?$/, "Enter the amount like 499 or 499.00."),
  notes: z.string().trim().max(300),
  activate: z.boolean(),
});

export async function addPrice(input: z.input<typeof priceSchema>): Promise<AdminResult> {
  if (!(await adminActor())) return NOT_ADMIN;
  const parsed = priceSchema.safeParse(input);
  if (!parsed.success) return failed(parsed.error.issues[0]?.message ?? "Check the price.");
  const amountMinor = Math.round(Number(parsed.data.amount) * 100);
  if (amountMinor <= 0) return failed("The amount must be more than zero.");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("prices")
    .insert({ product: "offer_letter", purpose: parsed.data.purpose, currency: parsed.data.currency, amount_minor: amountMinor, notes: parsed.data.notes || null, active: false })
    .select("id")
    .single();
  if (error || !data) return failed("The price couldn’t be added.", error);
  if (parsed.data.activate) {
    const { error: activateError } = await supabase.rpc("activate_price", { p_id: data.id });
    if (activateError) return failed("The price was added but couldn’t be switched on.", activateError);
  }
  return done(["/admin", "/admin/prices", "/"], parsed.data.activate ? "Price added and switched on." : "Price added.");
}

export async function activatePrice(id: string): Promise<AdminResult> {
  if (!(await adminActor())) return NOT_ADMIN;
  const supabase = await createClient();
  const { error } = await supabase.rpc("activate_price", { p_id: id });
  if (error) return failed("The price couldn’t be switched on.", error);
  return done(["/admin", "/admin/prices", "/"], "Price switched on. New checkouts use it now.");
}

const planSchema = z.object({
  onboarding: z.string().trim().regex(/^\d{1,7}(\.\d{1,2})?$/, "Enter the onboarding fee like 4999."),
  monthly: z.string().trim().regex(/^\d{1,7}(\.\d{1,2})?$/, "Enter the monthly price like 4999."),
  allowance: z.string().trim().regex(/^\d{1,7}(\.\d{1,2})?$/, "Enter the domain allowance like 1499."),
});

/** Website plan prices. Invoices already issued keep their amount; new ones use these. */
export async function savePlan(planId: string, input: z.input<typeof planSchema>): Promise<AdminResult> {
  if (!(await adminActor())) return NOT_ADMIN;
  const parsed = planSchema.safeParse(input);
  if (!parsed.success) return failed(parsed.error.issues[0]?.message ?? "Check the plan’s prices.");
  const minor = (value: string) => Math.round(Number(value) * 100);
  const update = { onboarding_minor: minor(parsed.data.onboarding), monthly_minor: minor(parsed.data.monthly), domain_allowance_minor: minor(parsed.data.allowance) };
  if (update.onboarding_minor <= 0 || update.monthly_minor <= 0) return failed("Prices must be more than zero.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("plans").update(update).eq("id", planId).select("name").maybeSingle();
  if (error || !data) return failed("The plan couldn’t be saved.", error);
  return done(["/admin/prices", "/website", "/"], `${data.name} saved. New invoices use these prices.`);
}

// --- Companies ------------------------------------------------------------------------------------------------

export async function setCompanyLimit(ownerId: string, limit: number): Promise<AdminResult> {
  if (!(await adminActor())) return NOT_ADMIN;
  if (!Number.isInteger(limit) || limit < 0 || limit > 100) return failed("The limit must be a whole number from 0 to 100.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("profiles").update({ company_limit: limit }).eq("id", ownerId).select("email").maybeSingle();
  if (error || !data) return failed("The limit couldn’t be saved.", error);
  return done(["/admin/companies"], `${data.email ?? "The owner"} can now save ${limit} ${limit === 1 ? "company" : "companies"}.`);
}

export async function suspendCompany(companyId: string, reason: string): Promise<AdminResult> {
  if (!(await adminActor())) return NOT_ADMIN;
  const text = reason.trim();
  if (text.length < 10 || text.length > 1000) return failed("Give the reason the owner will see (10 to 1,000 characters).");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("companies")
    .update({ suspended_at: new Date().toISOString(), suspended_reason: text })
    .eq("id", companyId)
    .select("legal_name, profiles(email)")
    .maybeSingle();
  if (error || !data) return failed("The company couldn’t be suspended.", error);

  const owner = data.profiles?.email;
  const emailed = owner
    ? await sendEmail({
        to: owner,
        subject: `${data.legal_name} is suspended on ${BRAND.name}`,
        text: `Hello,\n\nWe’ve suspended ${data.legal_name} on ${BRAND.name}, so no new letters or payments can be made for it.\n\nReason: ${text}\n\nLetters you’ve already issued stay available to download: ${appUrl()}/dashboard\n\nIf you think this is a mistake, reply to this email.\n\n${BRAND.name}`,
        html: `<p>Hello,</p><p>We’ve suspended <strong>${escapeHtml(data.legal_name)}</strong> on ${BRAND.name}, so no new letters or payments can be made for it.</p><p><strong>Reason:</strong> ${escapeHtml(text)}</p><p>Letters you’ve already issued stay available to <a href="${appUrl()}/dashboard">download</a>.</p><p>If you think this is a mistake, reply to this email.</p><p>${BRAND.name}</p>`,
      })
    : false;
  return done(["/admin", "/admin/companies"], emailed ? `${data.legal_name} is suspended. We emailed the owner.` : `${data.legal_name} is suspended. The owner couldn’t be emailed.`);
}

export async function liftSuspension(companyId: string): Promise<AdminResult> {
  if (!(await adminActor())) return NOT_ADMIN;
  const supabase = await createClient();
  const { data, error } = await supabase.from("companies").update({ suspended_at: null, suspended_reason: null }).eq("id", companyId).select("legal_name").maybeSingle();
  if (error || !data) return failed("The suspension couldn’t be lifted.", error);
  return done(["/admin", "/admin/companies"], `${data.legal_name} can make letters again.`);
}

// --- Misuse reports -------------------------------------------------------------------------------------------

const reportSchema = z.object({
  status: z.enum(["new", "investigating", "closed"]),
  adminNotes: z.string().trim().max(5000),
  companyId: z.uuid().nullable(),
});

export async function updateReport(id: string, input: z.input<typeof reportSchema>): Promise<AdminResult> {
  const actor = await adminActor();
  if (!actor) return NOT_ADMIN;
  const parsed = reportSchema.safeParse(input);
  if (!parsed.success) return failed("Check the report’s details.");
  const supabase = await createClient();
  const { error } = await supabase
    .from("abuse_reports")
    .update({ status: parsed.data.status, admin_notes: parsed.data.adminNotes || null, company_id: parsed.data.companyId, handled_by: actor.id })
    .eq("id", id);
  if (error) return failed("The report couldn’t be saved.", error);
  return done(["/admin", "/admin/reports", "/admin/companies"], parsed.data.status === "closed" ? "Report closed." : "Report saved.");
}

// --- Payments -------------------------------------------------------------------------------------------------

/**
 * Records a refund made in the PayU dashboard (the money is sent back there). The letter keeps its issued PDFs,
 * but its free corrections end.
 */
export async function recordRefund(txnid: string, note: string): Promise<AdminResult> {
  const actor = await adminActor();
  if (!actor) return NOT_ADMIN;
  const text = note.trim();
  if (text.length < 5 || text.length > 500) return failed("Say why and how it was refunded (5 to 500 characters), e.g. the PayU refund reference.");
  const db = adminClient();
  const now = new Date().toISOString();
  const { data: payment, error } = await db
    .from("payments")
    .update({ status: "refunded", refunded_at: now, refund_note: text })
    .eq("txnid", txnid)
    .eq("status", "success")
    .select("id, letter_id")
    .maybeSingle();
  if (error || !payment) return failed("Only a successful payment can be refunded.", error);
  if (payment.letter_id) await db.from("letters").update({ correction_until: now }).eq("id", payment.letter_id).gt("correction_until", now);
  await auditAs(actor, "refund", "payments", payment.id, { txnid, note: text });
  return done(["/admin", "/admin/payments"], `Refund recorded for ${txnid}.`);
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}
