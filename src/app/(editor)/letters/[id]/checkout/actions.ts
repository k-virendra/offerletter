"use server";

import { z } from "zod";
import { getUser } from "@/lib/auth";
import { blockingProblems } from "@/lib/letter/fields";
import { billingErrors, billingRecord, billingSchema, type BillingErrors } from "@/lib/payments/billing";
import { activePrices } from "@/lib/payments/prices.server";
import { buildPayuFields, newTxnid } from "@/lib/payu/fields";
import { appUrl, payuConfig } from "@/lib/payu/gateway.server";
import { snapshotDraft } from "@/lib/pdf/inputs.server";
import { contentHash } from "@/lib/pdf/snapshot";
import { takeRateLimit } from "@/lib/rate-limit";
import { adminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

export type StartCheckoutResult =
  | { ok: true; action: string; fields: Record<string, string> }
  | { ok: false; message: string; errors?: BillingErrors; pendingTxnid?: string };

/**
 * "Pay": checks everything again on the server, freezes the letter as it is now, records the payment with the
 * price from the database and returns the signed form the browser posts to PayU.
 */
export async function startCheckout(letterId: string, input: Record<string, unknown>): Promise<StartCheckoutResult> {
  const user = await getUser();
  if (!user) return { ok: false, message: "Your session has ended. Sign in again to pay." };
  if (!z.uuid().safeParse(letterId).success) return { ok: false, message: "We couldn’t find this letter." };

  const parsed = billingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Check the highlighted details.", errors: billingErrors(parsed.error) };
  if (!(await takeRateLimit(`checkout:${user.id}`, 600, 10))) {
    return { ok: false, message: "You’ve started several payments in a short time. Wait a few minutes, then try again." };
  }

  // RLS: only the author can read the letter.
  const supabase = await createClient();
  const { data: letter } = await supabase.from("letters").select("id, status, company_id, companies(archived_at, suspended_at)").eq("id", letterId).eq("author_id", user.id).maybeSingle();
  if (!letter?.companies) return { ok: false, message: "We couldn’t find this letter. It may have been deleted." };
  if (letter.status !== "draft") return { ok: false, message: "This letter has already been paid for." };
  if (letter.companies.suspended_at) return { ok: false, message: "Letters for this company are paused. Contact support to find out more." };
  if (letter.companies.archived_at) return { ok: false, message: "This company is archived. Restore it in My companies first." };

  const admin = adminClient();
  const { data: pending } = await admin.from("payments").select("txnid").eq("letter_id", letterId).eq("status", "pending").limit(1).maybeSingle();
  if (pending) return { ok: false, message: "A payment for this letter is still being confirmed.", pendingTxnid: pending.txnid };

  const frozen = await snapshotDraft(letterId);
  if (!frozen) return { ok: false, message: "Letters for this country aren’t available right now." };
  const problems = blockingProblems(frozen.snapshot.context, frozen.snapshot.state, frozen.snapshot.date);
  if (problems.missing.length || problems.invalid.length) {
    return { ok: false, message: "Some details in the letter are missing or need a fix. Go back to the letter to finish them." };
  }

  let config;
  try {
    config = payuConfig();
  } catch (error) {
    console.error("PayU isn't configured", error);
    return { ok: false, message: "Payments aren’t available right now. Try again later." };
  }
  const prices = await activePrices();

  // An earlier checkout for this letter that never came back from PayU is closed: this one replaces it.
  await admin.from("payments").update({ status: "failed", failure_reason: "Replaced by a newer checkout." }).eq("letter_id", letterId).eq("status", "initiated");

  const txnid = newTxnid();
  const { error } = await admin.from("payments").insert({
    letter_id: letterId,
    user_id: user.id,
    company_id: letter.company_id,
    txnid,
    amount_minor: prices.charge.amountMinor,
    currency: prices.charge.currency,
    display_amount_minor: prices.display.amountMinor,
    display_currency: prices.display.currency,
    billing: billingRecord(parsed.data),
    letter_snapshot: frozen.snapshot as unknown as Json,
    company_snapshot: frozen.company as unknown as Json,
    content_hash: contentHash(frozen.snapshot, frozen.company),
  });
  if (error) {
    console.error("startCheckout couldn't record the payment", error.code, error.message);
    return { ok: false, message: "We couldn’t start the payment. Try again in a moment." };
  }

  const fields = buildPayuFields({
    key: config.key,
    salt: config.salt,
    txnid,
    amountMinor: prices.charge.amountMinor,
    productinfo: "Offer letter",
    firstname: parsed.data.fullName,
    email: parsed.data.email,
    returnUrl: `${appUrl()}/api/payu/return`,
    letterId,
    userId: user.id,
  });
  return { ok: true, action: config.checkoutUrl, fields };
}
