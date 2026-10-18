import "server-only";
import { buildPayuFields, newTxnid } from "@/lib/payu/fields";
import { appUrl, payuConfig } from "@/lib/payu/gateway.server";
import { adminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { billingRecord, type Billing } from "./billing";
import type { Money } from "./prices.server";

// Starting a PayU payment for anything sold here: records the payment and returns the signed form the browser
// posts to PayU (or the local simulator). Callers check first that the user may pay for the thing.

export type StartPaymentInput = {
  userId: string;
  companyId: string | null;
  billing: Billing;
  /** The amount PayU collects, and the price as shown when it's in another currency. */
  charge: Money;
  display?: Money;
  /** What the customer sees at PayU, e.g. "Offer letter". */
  productinfo: string;
} & (
  | { kind: "letter"; letterId: string; snapshot: Json; companySnapshot: Json; contentHash: string }
  | { kind: "invoice"; invoiceId: string }
);

export type StartPaymentResult = { ok: true; action: string; fields: Record<string, string>; txnid: string } | { ok: false; message: string };

export async function startPayment(input: StartPaymentInput): Promise<StartPaymentResult> {
  let config;
  try {
    config = payuConfig();
  } catch (error) {
    console.error("PayU isn't configured", error);
    return { ok: false, message: "Payments aren’t available right now. Try again later." };
  }
  const db = adminClient();
  const reference = input.kind === "letter" ? input.letterId : input.invoiceId;

  // An earlier attempt for the same thing that never came back from PayU is closed: this one replaces it.
  await db
    .from("payments")
    .update({ status: "failed", failure_reason: "Replaced by a newer checkout." })
    .eq(input.kind === "letter" ? "letter_id" : "invoice_id", reference)
    .eq("status", "initiated");

  const txnid = newTxnid();
  const display = input.display ?? input.charge;
  const { error } = await db.from("payments").insert({
    kind: input.kind,
    user_id: input.userId,
    company_id: input.companyId,
    txnid,
    amount_minor: input.charge.amountMinor,
    currency: input.charge.currency,
    display_amount_minor: display.amountMinor,
    display_currency: display.currency,
    billing: billingRecord(input.billing),
    ...(input.kind === "letter"
      ? { letter_id: input.letterId, letter_snapshot: input.snapshot, company_snapshot: input.companySnapshot, content_hash: input.contentHash }
      : { invoice_id: input.invoiceId }),
  });
  if (error) {
    console.error("startPayment couldn't record the payment", error.code, error.message);
    return { ok: false, message: "We couldn’t start the payment. Try again in a moment." };
  }

  const fields = buildPayuFields({
    key: config.key,
    salt: config.salt,
    txnid,
    amountMinor: input.charge.amountMinor,
    productinfo: input.productinfo,
    firstname: input.billing.fullName,
    email: input.billing.email,
    returnUrl: `${appUrl()}/api/payu/return`,
    reference,
    userId: input.userId,
  });
  return { ok: true, action: config.checkoutUrl, fields, txnid };
}
