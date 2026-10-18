import "server-only";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { findPayment, settlePayment, type PaymentStatus, type PaymentSummary } from "./process.server";

// What the payment status page shows, for the signed-in payer only.

export type PaymentCheck = { status: PaymentStatus | "unknown"; failureReason: string | null; ready: boolean };

const UNKNOWN: PaymentCheck = { status: "unknown", failureReason: null, ready: false };

/** The payer's payment, asked of PayU again when it isn't final yet (a confirmed one is completed if needed). */
export async function checkOwnPayment(userId: string, txnid: string): Promise<PaymentCheck> {
  // The payer's own payment only; everything after this uses the server's own access.
  const supabase = await createClient();
  const { data: own } = await supabase.from("payments").select("id").eq("txnid", txnid).eq("user_id", userId).maybeSingle();
  if (!own) return UNKNOWN;

  const payment = await findPayment(txnid);
  if (!payment) return UNKNOWN;
  const settled = await settlePayment(payment);
  return { status: settled.status, failureReason: settled.failure_reason, ready: settled.status === "success" ? await fulfilled(settled) : false };
}

/** A confirmed payment is "ready" once what it paid for is done: the letter's PDF, or the invoice settled. */
async function fulfilled(payment: PaymentSummary): Promise<boolean> {
  if (payment.kind === "invoice") {
    if (!payment.invoice_id) return false;
    const { data } = await adminClient().from("invoices").select("status").eq("id", payment.invoice_id).maybeSingle();
    return data?.status === "paid";
  }
  return payment.letter_id ? firstVersionReady(payment.letter_id) : false;
}

export async function firstVersionReady(letterId: string): Promise<boolean> {
  const { data } = await adminClient().from("letter_versions").select("pdf_path").eq("letter_id", letterId).eq("version", 1).maybeSingle();
  return Boolean(data?.pdf_path);
}
