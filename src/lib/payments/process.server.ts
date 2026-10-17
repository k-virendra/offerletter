import "server-only";
import { failureReason } from "@/lib/payments/billing";
import { loggableResponse } from "@/lib/payu/fields";
import { isGenuineResponse, verifyPayment } from "@/lib/payu/gateway.server";
import type { Verification } from "@/lib/payu/verify";
import { adminClient } from "@/lib/supabase/admin";
import type { Database } from "@/lib/supabase/database.types";
import { completePaidLetter } from "./complete.server";

// Turning what PayU tells us into a payment status. Responses posted to us (the browser return and the webhook)
// only start the process: they must carry PayU's hash for our key, and even then the status is taken from
// verify_payment, asked server to server, and the amount must match what was charged.

export type PaymentStatus = Database["public"]["Enums"]["payment_status"];
export type PaymentSummary = { id: string; txnid: string; letter_id: string | null; status: PaymentStatus; amount_minor: number; failure_reason: string | null };

const SUMMARY = "id, txnid, letter_id, status, amount_minor, failure_reason";
const TXNID = /^[A-Za-z0-9_-]{8,40}$/;

export async function findPayment(txnid: string): Promise<PaymentSummary | null> {
  if (!TXNID.test(txnid)) return null;
  const { data } = await adminClient().from("payments").select(SUMMARY).eq("txnid", txnid).maybeSingle();
  return data;
}

/** A response PayU posted to the return URL or the webhook. Returns the payment it was about, if any. */
export async function handlePayuResponse(fields: Record<string, string>, source: "return" | "webhook"): Promise<PaymentSummary | null> {
  const payment = await findPayment(fields.txnid ?? "");
  if (!payment) {
    console.warn(`PayU ${source} for an unknown transaction`);
    return null;
  }
  // Unsigned or wrongly signed posts aren't logged (anyone can post here) and change nothing.
  if (!isGenuineResponse(fields)) {
    console.warn(`PayU ${source} with a bad hash`, payment.txnid);
    return payment;
  }
  await logResponse(payment.txnid, loggableResponse(fields, source));
  return settlePayment(payment);
}

async function logResponse(txnid: string, entry: Record<string, string>) {
  const { error } = await adminClient().rpc("append_payment_response", { p_txnid: txnid, p_entry: entry });
  if (error) console.error("couldn't log a PayU response", error.message);
}

/**
 * Asks PayU for the payment's status and records it. A confirmed payment is completed (letter paid, version 1,
 * receipt) here too, and again on every later call until that has finished.
 */
export async function settlePayment(payment: PaymentSummary): Promise<PaymentSummary> {
  if (payment.status === "refunded") return payment;
  if (payment.status === "success") {
    await completeSafely(payment);
    return payment;
  }

  let result: Verification;
  try {
    result = await verifyPayment(payment.txnid);
  } catch (error) {
    console.error("PayU verify_payment failed", payment.txnid, error);
    return payment;
  }

  const db = adminClient();
  const now = new Date().toISOString();
  const record = (entry: Record<string, string>) => logResponse(payment.txnid, { ...entry, received_from: "verify_payment", received_at: now });

  if (result.status === "success") {
    if (result.amountMinor !== payment.amount_minor) {
      // Never treated as paid: someone has to look at it.
      console.error("PayU confirmed a different amount", payment.txnid, { expected: payment.amount_minor, confirmed: result.amountMinor });
      await record({ ...result.raw, note: "amount_mismatch" });
      return payment;
    }
    const { data } = await db
      .from("payments")
      .update({ status: "success", payu_payment_id: result.mihpayid, verified_at: now, failure_reason: null })
      .eq("id", payment.id)
      .in("status", ["initiated", "pending", "failed"])
      .select(SUMMARY)
      .maybeSingle();
    if (data) await record(result.raw);
    const settled = data ?? (await findPayment(payment.txnid)) ?? payment;
    if (settled.status === "success") await completeSafely(settled);
    return settled;
  }

  if (result.status === "failure") {
    const reason = failureReason({ unmappedStatus: result.raw.unmappedstatus, message: result.errorMessage });
    const { data } = await db
      .from("payments")
      .update({ status: "failed", failure_reason: reason, verified_at: now })
      .eq("id", payment.id)
      .in("status", ["initiated", "pending"])
      .select(SUMMARY)
      .maybeSingle();
    if (data) await record(result.raw);
    return data ?? (await findPayment(payment.txnid)) ?? payment;
  }

  if (result.status === "pending" && payment.status === "initiated") {
    const { data } = await db.from("payments").update({ status: "pending" }).eq("id", payment.id).eq("status", "initiated").select(SUMMARY).maybeSingle();
    if (data) await record(result.raw);
    return data ?? payment;
  }

  // Still pending, or PayU has no record yet (the customer is still on its page or never got there).
  return payment;
}

/** Completion errors (a PDF that failed to render, say) leave the payment confirmed; the recheck job retries. */
async function completeSafely(payment: PaymentSummary) {
  try {
    await completePaidLetter(payment.id);
  } catch (error) {
    console.error("completing a paid letter failed", payment.txnid, error);
  }
}
