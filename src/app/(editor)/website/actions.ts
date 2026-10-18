"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getUser } from "@/lib/auth";
import { sendEmail } from "@/lib/email/send.server";
import { serverEnv } from "@/lib/env.server";
import { billingErrors, billingRecord, billingSchema, type BillingErrors, type CheckoutResult } from "@/lib/payments/billing";
import { startPayment } from "@/lib/payments/start.server";
import { appUrl } from "@/lib/payu/gateway.server";
import { takeRateLimit } from "@/lib/rate-limit";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { todayIso } from "@/lib/template/format";
import { websiteUpdateEmail } from "@/lib/websites/emails";
import { orderErrors, orderSchema, type OrderErrors } from "@/lib/websites/order";
import { monthLabel, onboardingPeriod } from "@/lib/websites/periods";
import { activePlan } from "@/lib/websites/queries.server";

// Ordering a business website, paying its invoices, and asking to cancel. Everything is checked here again;
// the database is written with the secret key only after these checks.

export type WebsiteOrderResult = CheckoutResult | { ok: false; message: string; orderErrors: OrderErrors; errors?: BillingErrors; pendingTxnid?: undefined };

const SIGNED_OUT = "Your session has ended. Sign in again to continue.";

/**
 * "Pay": records the order (or updates an unpaid one for the same business), issues the onboarding invoice and
 * returns the signed PayU form.
 */
export async function startWebsiteOrder(input: { order: Record<string, unknown>; billing: Record<string, unknown> }): Promise<WebsiteOrderResult> {
  const user = await getUser();
  if (!user) return { ok: false, message: SIGNED_OUT };
  const order = orderSchema.safeParse(input.order);
  if (!order.success) return { ok: false, message: "Check the highlighted details.", orderErrors: orderErrors(order.error) };
  const billing = billingSchema.safeParse(input.billing);
  if (!billing.success) return { ok: false, message: "Check the highlighted details.", errors: billingErrors(billing.error) };
  if (!(await takeRateLimit(`website-order:${user.id}`, 600, 10))) return { ok: false, message: "You’ve started several orders in a short time. Wait a few minutes, then try again." };

  const supabase = await createClient();
  const { data: company } = await supabase.from("companies").select("id, legal_name, archived_at, suspended_at").eq("id", order.data.companyId).eq("owner_id", user.id).maybeSingle();
  if (!company) return { ok: false, message: "Choose one of your businesses.", orderErrors: { companyId: "Choose one of your businesses." } };
  if (company.suspended_at) return { ok: false, message: "This business is suspended. Contact support to find out more." };
  if (company.archived_at) return { ok: false, message: "This business is archived. Restore it in My companies first." };

  const plan = await activePlan();
  if (!plan) return { ok: false, message: "Websites aren’t available to order right now. Try again later." };

  const db = adminClient();
  const details = {
    requested_domains: order.data.domains,
    mailbox_name: order.data.mailboxName,
    brief: { about: order.data.about, pages: order.data.pages, references: order.data.references },
    billing: billingRecord(billing.data),
    contact_phone: order.data.contactPhone,
  };
  const { data: existing } = await db.from("subscriptions").select("id, status").eq("company_id", company.id).neq("status", "cancelled").maybeSingle();
  if (existing && existing.status !== "pending_payment") {
    return { ok: false, message: `${company.legal_name} already has a website plan. Open it from Website in the menu.` };
  }

  let subscriptionId = existing?.id;
  if (subscriptionId) {
    const { error } = await db.from("subscriptions").update(details).eq("id", subscriptionId).eq("status", "pending_payment");
    if (error) return failed("update order", error);
  } else {
    const { data: created, error } = await db
      .from("subscriptions")
      .insert({ user_id: user.id, company_id: company.id, plan_id: plan.id, ...details })
      .select("id")
      .single();
    if (error?.code === "23505") return { ok: false, message: `${company.legal_name} already has a website plan.` };
    if (error || !created) return failed("create order", error);
    subscriptionId = created.id;
    await db.from("subscription_events").insert({ subscription_id: subscriptionId, kind: "ordered", message: "Order started." });
  }

  // The onboarding invoice: reused while unpaid, unless the price has changed since.
  const today = todayIso();
  const { data: open } = await db.from("invoices").select("id, amount_minor").eq("subscription_id", subscriptionId).eq("kind", "onboarding").eq("status", "open").maybeSingle();
  let invoiceId = open?.id;
  if (open && open.amount_minor !== plan.onboardingMinor) {
    await db.from("invoices").update({ status: "void", note: "Replaced: the price changed." }).eq("id", open.id).eq("status", "open");
    invoiceId = undefined;
  }
  if (invoiceId) {
    const { data: pending } = await db.from("payments").select("txnid").eq("invoice_id", invoiceId).eq("status", "pending").limit(1).maybeSingle();
    if (pending) return { ok: false, message: "A payment for this order is still being confirmed.", pendingTxnid: pending.txnid };
  } else {
    const period = onboardingPeriod(today);
    const { data: invoice, error } = await db
      .from("invoices")
      .insert({
        subscription_id: subscriptionId,
        user_id: user.id,
        kind: "onboarding",
        description: `${plan.name} – setup, domain and ${monthLabel(today)}`,
        amount_minor: plan.onboardingMinor,
        currency: plan.currency,
        period_start: period.start,
        period_end: period.end,
        due_on: today,
      })
      .select("id")
      .single();
    if (error || !invoice) return failed("create onboarding invoice", error);
    invoiceId = invoice.id;
  }

  const started = await startPayment({
    kind: "invoice",
    invoiceId,
    userId: user.id,
    companyId: company.id,
    billing: billing.data,
    charge: { currency: plan.currency, amountMinor: plan.onboardingMinor },
    productinfo: `${plan.name} setup`,
  });
  return started.ok ? { ok: true, action: started.action, fields: started.fields } : started;
}

/** "Pay now" for one of the customer's open invoices. */
export async function payInvoice(invoiceId: string, input: Record<string, unknown>): Promise<CheckoutResult> {
  const user = await getUser();
  if (!user) return { ok: false, message: SIGNED_OUT };
  if (!z.uuid().safeParse(invoiceId).success) return { ok: false, message: "We couldn’t find this invoice." };
  const billing = billingSchema.safeParse(input);
  if (!billing.success) return { ok: false, message: "Check the highlighted details.", errors: billingErrors(billing.error) };
  if (!(await takeRateLimit(`invoice-pay:${user.id}`, 600, 10))) return { ok: false, message: "You’ve started several payments in a short time. Wait a few minutes, then try again." };

  const supabase = await createClient();
  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, status, amount_minor, currency, description, subscription_id, subscriptions(status, company_id)")
    .eq("id", invoiceId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!invoice?.subscriptions) return { ok: false, message: "We couldn’t find this invoice." };
  if (invoice.status === "paid") return { ok: false, message: "This invoice is already paid." };
  if (invoice.status === "void") return { ok: false, message: "This invoice was cancelled, so there’s nothing to pay." };
  if (invoice.subscriptions.status === "cancelled") return { ok: false, message: "This website plan is cancelled." };

  const db = adminClient();
  const { data: pending } = await db.from("payments").select("txnid").eq("invoice_id", invoiceId).eq("status", "pending").limit(1).maybeSingle();
  if (pending) return { ok: false, message: "A payment for this invoice is still being confirmed.", pendingTxnid: pending.txnid };
  // Remembered for the next invoice.
  await db.from("subscriptions").update({ billing: billingRecord(billing.data) }).eq("id", invoice.subscription_id);

  const started = await startPayment({
    kind: "invoice",
    invoiceId,
    userId: user.id,
    companyId: invoice.subscriptions.company_id,
    billing: billing.data,
    charge: { currency: invoice.currency, amountMinor: invoice.amount_minor },
    productinfo: invoice.description,
  });
  return started.ok ? { ok: true, action: started.action, fields: started.fields } : started;
}

export type RequestResult = { ok: true; message: string } | { ok: false; message: string };

/** For the MVP the team confirms cancellations by hand: this records the request and tells them. */
export async function requestCancellation(subscriptionId: string): Promise<RequestResult> {
  const user = await getUser();
  if (!user) return { ok: false, message: SIGNED_OUT };
  if (!z.uuid().safeParse(subscriptionId).success) return { ok: false, message: "We couldn’t find this website plan." };
  const supabase = await createClient();
  const { data: subscription } = await supabase.from("subscriptions").select("id, status, cancel_requested_at, companies(legal_name)").eq("id", subscriptionId).eq("user_id", user.id).maybeSingle();
  if (!subscription || subscription.status === "cancelled") return { ok: false, message: "This website plan is already cancelled." };
  if (subscription.cancel_requested_at) return { ok: true, message: "You’ve already asked to cancel. Our team will be in touch." };

  const db = adminClient();
  await db.from("subscriptions").update({ cancel_requested_at: new Date().toISOString() }).eq("id", subscriptionId);
  await db.from("subscription_events").insert({ subscription_id: subscriptionId, kind: "cancel_requested", message: "You asked to cancel. Our team will contact you to confirm.", actor_id: user.id });
  const team = serverEnv().ADMIN_NOTIFY_EMAIL;
  if (team) {
    await sendEmail(
      websiteUpdateEmail({
        to: team,
        name: "team",
        subject: `Cancellation request: ${subscription.companies?.legal_name ?? "a website"}`,
        message: `${user.email ?? "A customer"} asked to cancel their website plan.`,
        dashboardUrl: `${appUrl()}/admin/websites?id=${subscriptionId}`,
      }),
    );
  }
  revalidatePath(`/website/${subscriptionId}`);
  return { ok: true, message: "We’ve received your request. Our team will contact you to confirm." };
}

function failed(step: string, error: { message: string } | null): CheckoutResult {
  console.error(`website order: couldn't ${step}`, error?.message);
  return { ok: false, message: "We couldn’t start your order. Try again in a moment." };
}
