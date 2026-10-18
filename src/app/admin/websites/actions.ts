"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { adminActor, auditAs, NOT_ADMIN, type AdminActor, type AdminResult } from "@/lib/admin/auth";
import { sendEmail } from "@/lib/email/send.server";
import { formatMoney } from "@/lib/payments/prices.server";
import { appUrl } from "@/lib/payu/gateway.server";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { formatDay, todayIso } from "@/lib/template/format";
import { subscriptionContact } from "@/lib/websites/contact.server";
import { invoiceReadyEmail, websiteUpdateEmail } from "@/lib/websites/emails";
import { isDomain, normalizeDomain } from "@/lib/websites/order";

// The team's side of a website order: recording the domain, website and mailbox as they're set up, activating,
// posting updates, invoices and status. Writes go through the admin's own session (RLS + guard triggers), so the
// audit log names who did what; settling an invoice by hand uses the secret key and is logged explicitly.

const uuid = z.uuid();

const refresh = (id: string) => {
  revalidatePath("/admin/websites");
  revalidatePath("/admin");
  revalidatePath(`/website/${id}`);
};

const customer = subscriptionContact;

async function notify(subscriptionId: string, subject: string, message: string, rows?: [string, string][]) {
  const who = await customer(subscriptionId);
  if (!who) return false;
  return sendEmail(websiteUpdateEmail({ to: who.to, name: who.name, subject, message, rows, dashboardUrl: `${appUrl()}/website/${subscriptionId}` }));
}

async function event(actor: AdminActor, subscriptionId: string, kind: string, message: string, visible = true) {
  const supabase = await createClient();
  const { error } = await supabase.from("subscription_events").insert({ subscription_id: subscriptionId, kind, message, visible_to_customer: visible, actor_id: actor.id });
  if (error) console.error("couldn't add a subscription event", error.message);
}

const failed = (message: string, error?: { message: string } | null): AdminResult => {
  if (error) console.error("admin website action failed", error.message);
  return { ok: false, message };
};

const rupees = (value: string) => Math.round(Number(value) * 100);
const amountText = z.string().trim().regex(/^\d{1,7}(\.\d{1,2})?$/, "Enter an amount like 1299 or 1299.00.");

// --- Setup checklist --------------------------------------------------------------------------------------------

const domainSchema = z.object({
  domain: z.string().transform(normalizeDomain).refine(isDomain, { message: "Enter the domain like mybusiness.in." }),
  registrar: z.string().trim().max(100),
  cost: z.union([z.literal(""), amountText]),
  expiresOn: z.iso.date({ message: "Enter the date the domain registration ends." }),
});

export async function saveDomain(subscriptionId: string, input: z.input<typeof domainSchema>): Promise<AdminResult> {
  const actor = await adminActor();
  if (!actor) return NOT_ADMIN;
  if (!uuid.safeParse(subscriptionId).success) return failed("This order no longer exists.");
  const parsed = domainSchema.safeParse(input);
  if (!parsed.success) return failed(parsed.error.issues[0]?.message ?? "Check the domain details.");
  const { domain, registrar, cost, expiresOn } = parsed.data;

  const supabase = await createClient();
  const { data: before } = await supabase.from("subscriptions").select("domain_ready_at").eq("id", subscriptionId).maybeSingle();
  if (!before) return failed("This order no longer exists.");
  const { error } = await supabase
    .from("subscriptions")
    .update({ domain, domain_expires_on: expiresOn, domain_ready_at: before.domain_ready_at ?? new Date().toISOString() })
    .eq("id", subscriptionId);
  if (error) return failed("The domain couldn’t be saved.", error);
  await supabase.from("subscription_private").upsert({ subscription_id: subscriptionId, registrar: registrar || null, domain_cost_minor: cost ? rupees(cost) : null });

  if (!before.domain_ready_at) {
    await event(actor, subscriptionId, "domain_ready", `Your domain ${domain} is registered.`);
    await notify(subscriptionId, `Your domain ${domain} is registered`, `Good news: your domain ${domain} is registered in your business’s name. Next we’re building your website.`, [
      ["Domain", domain],
      ["Registered until", formatDay(expiresOn)],
    ]);
  }
  refresh(subscriptionId);
  return { ok: true, message: before.domain_ready_at ? "Domain details saved." : "Domain marked as registered. The customer was told." };
}

const websiteSchema = z.object({ url: z.url({ message: "Enter the website’s address, like https://mybusiness.in." }).refine((v) => /^https?:\/\//i.test(v), { message: "Start the address with https://." }) });

export async function saveWebsite(subscriptionId: string, input: z.input<typeof websiteSchema>): Promise<AdminResult> {
  const actor = await adminActor();
  if (!actor) return NOT_ADMIN;
  if (!uuid.safeParse(subscriptionId).success) return failed("This order no longer exists.");
  const parsed = websiteSchema.safeParse({ url: String(input.url ?? "").trim() });
  if (!parsed.success) return failed(parsed.error.issues[0]?.message ?? "Check the website address.");

  const supabase = await createClient();
  const { data: before } = await supabase.from("subscriptions").select("website_ready_at").eq("id", subscriptionId).maybeSingle();
  if (!before) return failed("This order no longer exists.");
  const { error } = await supabase
    .from("subscriptions")
    .update({ website_url: parsed.data.url, website_ready_at: before.website_ready_at ?? new Date().toISOString() })
    .eq("id", subscriptionId);
  if (error) return failed("The website couldn’t be saved.", error);
  if (!before.website_ready_at) {
    await event(actor, subscriptionId, "website_ready", `Your website is live at ${parsed.data.url}.`);
    await notify(subscriptionId, "Your website is live", `Your website is live. Have a look, and reply to this email if you’d like anything changed.`, [["Website", parsed.data.url]]);
  }
  refresh(subscriptionId);
  return { ok: true, message: before.website_ready_at ? "Website saved." : "Website marked as live. The customer was told." };
}

const mailboxSchema = z.object({
  address: z.string().trim().toLowerCase().pipe(z.email({ message: "Enter the mailbox address, like info@mybusiness.in." })),
  provider: z.string().trim().min(2, "Name the email provider, e.g. Zoho Mail.").max(60),
});

export async function saveMailbox(subscriptionId: string, input: z.input<typeof mailboxSchema>): Promise<AdminResult> {
  const actor = await adminActor();
  if (!actor) return NOT_ADMIN;
  if (!uuid.safeParse(subscriptionId).success) return failed("This order no longer exists.");
  const parsed = mailboxSchema.safeParse(input);
  if (!parsed.success) return failed(parsed.error.issues[0]?.message ?? "Check the mailbox details.");

  const supabase = await createClient();
  const { data: before } = await supabase.from("subscriptions").select("mailbox_ready_at").eq("id", subscriptionId).maybeSingle();
  if (!before) return failed("This order no longer exists.");
  const { error } = await supabase
    .from("subscriptions")
    .update({ mailbox_address: parsed.data.address, mailbox_provider: parsed.data.provider, mailbox_ready_at: before.mailbox_ready_at ?? new Date().toISOString() })
    .eq("id", subscriptionId);
  if (error) return failed("The mailbox couldn’t be saved.", error);
  if (!before.mailbox_ready_at) {
    const who = await customer(subscriptionId);
    await event(actor, subscriptionId, "mailbox_ready", `Your email address ${parsed.data.address} is ready.`);
    await notify(
      subscriptionId,
      `Your email address ${parsed.data.address} is ready`,
      `Your business email ${parsed.data.address} is set up with ${parsed.data.provider}. ${parsed.data.provider} has sent an invite${who ? ` to ${who.to}` : ""}: open it to choose your password and start using your mailbox.`,
    );
  }
  refresh(subscriptionId);
  return { ok: true, message: before.mailbox_ready_at ? "Mailbox saved." : "Mailbox marked as ready. The customer was told." };
}

/** Everything is set up: the subscription becomes active and the customer gets the "all set" email. */
export async function activateSubscription(subscriptionId: string): Promise<AdminResult> {
  const actor = await adminActor();
  if (!actor) return NOT_ADMIN;
  const supabase = await createClient();
  const { data: s } = await supabase
    .from("subscriptions")
    .select("status, domain, website_url, mailbox_address, domain_ready_at, website_ready_at, mailbox_ready_at, activated_at")
    .eq("id", subscriptionId)
    .maybeSingle();
  if (!s) return failed("This order no longer exists.");
  if (!s.domain_ready_at || !s.website_ready_at || !s.mailbox_ready_at) return failed("Finish the domain, website and email steps first.");
  if (s.activated_at) return failed("It’s already active.");
  // Past due stays past due until paid; settle_invoice then makes it active.
  const update = s.status === "onboarding" ? { status: "active" as const, activated_at: new Date().toISOString() } : { activated_at: new Date().toISOString() };
  const { error } = await supabase.from("subscriptions").update(update).eq("id", subscriptionId);
  if (error) return failed("It couldn’t be activated.", error);
  await event(actor, subscriptionId, "activated", "Everything is set up: your website, domain and email are ready.");
  await notify(subscriptionId, "Your website, domain and email are ready", "Everything is set up. Thank you for choosing us: we’re here if you need any changes.", [
    ["Website", s.website_url ?? ""],
    ["Domain", s.domain ?? ""],
    ["Email", s.mailbox_address ?? ""],
  ]);
  refresh(subscriptionId);
  return { ok: true, message: "Activated. The customer was emailed." };
}

// --- Updates and notes ------------------------------------------------------------------------------------------

export async function postUpdate(subscriptionId: string, input: { message: string; visible: boolean; email: boolean }): Promise<AdminResult> {
  const actor = await adminActor();
  if (!actor) return NOT_ADMIN;
  const message = input.message.trim();
  if (message.length < 3 || message.length > 1000) return failed("Write the update (up to 1,000 characters).");
  await event(actor, subscriptionId, input.visible ? "update" : "note", message, input.visible);
  const emailed = input.visible && input.email ? await notify(subscriptionId, "An update on your website", message) : false;
  refresh(subscriptionId);
  return { ok: true, message: input.visible ? (emailed ? "Update posted and emailed." : "Update posted.") : "Internal note added." };
}

export async function saveAdminNotes(subscriptionId: string, notes: string): Promise<AdminResult> {
  if (!(await adminActor())) return NOT_ADMIN;
  if (notes.length > 5000) return failed("Keep notes under 5,000 characters.");
  const supabase = await createClient();
  const { error } = await supabase.from("subscription_private").upsert({ subscription_id: subscriptionId, admin_notes: notes.trim() || null });
  if (error) return failed("The notes couldn’t be saved.", error);
  refresh(subscriptionId);
  return { ok: true, message: "Notes saved." };
}

// --- Invoices -----------------------------------------------------------------------------------------------------

const oneOffSchema = z.object({ description: z.string().trim().min(3, "Say what the invoice is for.").max(200), amount: amountText });

/** An extra charge, e.g. a domain that costs more than the plan includes. */
export async function addOneOffInvoice(subscriptionId: string, input: z.input<typeof oneOffSchema>): Promise<AdminResult> {
  const actor = await adminActor();
  if (!actor) return NOT_ADMIN;
  const parsed = oneOffSchema.safeParse(input);
  if (!parsed.success) return failed(parsed.error.issues[0]?.message ?? "Check the invoice.");
  const amountMinor = rupees(parsed.data.amount);
  if (amountMinor <= 0) return failed("The amount must be more than zero.");

  const supabase = await createClient();
  const { data: s } = await supabase.from("subscriptions").select("user_id, status, plans(currency)").eq("id", subscriptionId).maybeSingle();
  if (!s) return failed("This order no longer exists.");
  if (s.status === "cancelled") return failed("This plan is cancelled.");
  const currency = s.plans?.currency ?? "INR";
  const { data: invoice, error } = await supabase
    .from("invoices")
    .insert({ subscription_id: subscriptionId, user_id: s.user_id, kind: "one_off", description: parsed.data.description, amount_minor: amountMinor, currency, due_on: todayIso(), created_by: actor.id })
    .select("id")
    .single();
  if (error || !invoice) return failed("The invoice couldn’t be added.", error);
  await event(actor, subscriptionId, "invoice", `New invoice: ${parsed.data.description}.`);
  const who = await customer(subscriptionId);
  if (who) {
    await sendEmail(
      invoiceReadyEmail({ to: who.to, name: who.name, description: parsed.data.description, amount: formatMoney({ currency, amountMinor }), dueOn: formatDay(todayIso()), payUrl: `${appUrl()}/website/invoices/${invoice.id}/pay` }),
    );
  }
  refresh(subscriptionId);
  return { ok: true, message: "Invoice added and emailed to the customer." };
}

export async function voidInvoice(invoiceId: string, reason: string): Promise<AdminResult> {
  if (!(await adminActor())) return NOT_ADMIN;
  const note = reason.trim();
  if (note.length < 3 || note.length > 500) return failed("Say why the invoice is cancelled.");
  const supabase = await createClient();
  const { data, error } = await supabase.from("invoices").update({ status: "void", note }).eq("id", invoiceId).eq("status", "open").select("subscription_id").maybeSingle();
  if (error || !data) return failed("Only an unpaid invoice can be cancelled.", error);
  refresh(data.subscription_id);
  return { ok: true, message: "Invoice cancelled." };
}

/** For money received outside PayU (a bank transfer, say): settles the invoice like a payment would. */
export async function markInvoicePaid(invoiceId: string, reason: string): Promise<AdminResult> {
  const actor = await adminActor();
  if (!actor) return NOT_ADMIN;
  const note = reason.trim();
  if (note.length < 5 || note.length > 500) return failed("Say how it was paid, e.g. the bank transfer reference.");
  const db = adminClient();
  const { data: invoice } = await db.from("invoices").select("subscription_id, status").eq("id", invoiceId).maybeSingle();
  if (!invoice || invoice.status !== "open") return failed("Only an unpaid invoice can be marked as paid.");
  // No PayU payment: the generated types don't know p_payment may be null.
  const { data: result, error } = await db.rpc("settle_invoice", { p_invoice: invoiceId, p_payment: null as unknown as string, p_paid_at: new Date().toISOString(), p_note: `Paid outside PayU: ${note}` });
  if (error) return failed("The invoice couldn’t be marked as paid.", error);
  await auditAs(actor, "paid_offline", "invoices", invoiceId, { note, result });
  refresh(invoice.subscription_id);
  return { ok: true, message: "Invoice marked as paid." };
}

// --- Status -----------------------------------------------------------------------------------------------------

export async function changeStatus(subscriptionId: string, action: "suspend" | "reinstate" | "cancel", reason: string): Promise<AdminResult> {
  const actor = await adminActor();
  if (!actor) return NOT_ADMIN;
  const text = reason.trim();
  if (action !== "reinstate" && (text.length < 5 || text.length > 1000)) return failed("Give the reason the customer will see.");
  const supabase = await createClient();
  const { data: s } = await supabase.from("subscriptions").select("status, activated_at").eq("id", subscriptionId).maybeSingle();
  if (!s) return failed("This order no longer exists.");

  let status: "suspended" | "cancelled" | "active" | "onboarding" | "past_due";
  if (action === "suspend") status = "suspended";
  else if (action === "cancel") status = "cancelled";
  else {
    if (s.status !== "suspended") return failed("Only a suspended plan can be reinstated.");
    const { count } = await supabase.from("invoices").select("id", { count: "exact", head: true }).eq("subscription_id", subscriptionId).eq("status", "open").lte("due_on", todayIso());
    status = count ? "past_due" : s.activated_at ? "active" : "onboarding";
  }
  const { error } = await supabase.from("subscriptions").update({ status, status_reason: action === "reinstate" ? null : text }).eq("id", subscriptionId);
  if (error) return failed(error.message === "invalid_subscription_transition" ? "That change isn’t possible from the plan’s current status." : "The status couldn’t be changed.", error);

  const copy = {
    suspend: { subject: "Your website plan is suspended", message: `We’ve suspended your website plan. Reason: ${text}` },
    cancel: { subject: "Your website plan is cancelled", message: `Your website plan is cancelled. ${text}` },
    reinstate: { subject: "Your website plan is running again", message: "Your website plan is running again. Thank you!" },
  }[action];
  await event(actor, subscriptionId, action === "reinstate" ? "reinstated" : action === "suspend" ? "suspended" : "cancelled", copy.message);
  await notify(subscriptionId, copy.subject, copy.message);
  refresh(subscriptionId);
  return { ok: true, message: { suspend: "Suspended. The customer was emailed.", cancel: "Cancelled. The customer was emailed.", reinstate: "Reinstated. The customer was emailed." }[action] };
}
