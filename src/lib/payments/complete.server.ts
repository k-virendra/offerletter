import "server-only";
import { receiptEmail } from "@/lib/email/receipt";
import { sendEmail } from "@/lib/email/send.server";
import { appUrl } from "@/lib/payu/gateway.server";
import { issueLetterVersion, type IssuedVersion } from "@/lib/pdf/issue.server";
import type { IssuedCompany, IssuedSnapshot } from "@/lib/pdf/snapshot";
import { adminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { formatDay } from "@/lib/template/format";
import { formatMoney } from "./prices.server";

// What happens once PayU confirms a payment. Every step is safe to repeat, because the browser return, the webhook
// and the recheck job may all get here for the same payment:
//   1. the letter becomes paid, set back to exactly what was paid for, with seven days of free corrections,
//   2. version 1 is issued from the letter frozen at checkout, with its final PDF,
//   3. the receipt is emailed once.

export const CORRECTION_DAYS = 7;

/** When free corrections end for a letter paid at `paidAt`. */
export function correctionDeadline(paidAt = new Date()): Date {
  return new Date(paidAt.getTime() + CORRECTION_DAYS * 86_400_000);
}

const PAYMENT_FOR_COMPLETION =
  "id, txnid, status, letter_id, verified_at, created_at, letter_snapshot, company_snapshot, billing, amount_minor, currency, display_amount_minor, display_currency, receipt_sent_at";

export async function completePaidLetter(paymentId: string): Promise<IssuedVersion | null> {
  const db = adminClient();
  const { data: payment } = await db.from("payments").select(PAYMENT_FOR_COMPLETION).eq("id", paymentId).maybeSingle();
  if (!payment || payment.status !== "success") return null;
  if (!payment.letter_id || !payment.letter_snapshot || !payment.company_snapshot) {
    // The letter was deleted while PayU was open: there's nothing to issue. Support refunds these.
    console.error("paid payment has no letter to issue", payment.txnid);
    return null;
  }
  if (payment.receipt_sent_at) {
    // The last step is done, so the others are too (the usual case on every later call).
    const { data: first } = await db.from("letter_versions").select("id, pdf_path, content_hash").eq("letter_id", payment.letter_id).eq("version", 1).maybeSingle();
    if (first?.pdf_path) return { versionId: first.id, version: 1, pdfPath: first.pdf_path, contentHash: first.content_hash };
  }
  const frozen = { snapshot: payment.letter_snapshot as unknown as IssuedSnapshot, company: payment.company_snapshot as unknown as IssuedCompany };
  const paidAt = new Date(payment.verified_at ?? payment.created_at);
  const state = frozen.snapshot.state;

  // Edits made in another tab while PayU was open are discarded: corrections start from what was paid for.
  const { error } = await db
    .from("letters")
    .update({
      status: "paid",
      paid_at: paidAt.toISOString(),
      correction_until: correctionDeadline(paidAt).toISOString(),
      jurisdiction_code: frozen.snapshot.context.jurisdiction.code,
      template_key: state.templateKey,
      accent_color: state.accentColor,
      field_values: state.values as Json,
      removed_sections: state.removedSections,
    })
    .eq("id", payment.letter_id)
    .eq("status", "draft");
  if (error) throw new Error(`Couldn't mark the letter paid: ${error.message}`);

  const issued = await issueLetterVersion(payment.letter_id, { frozen, version: 1, note: "Original, after payment" });
  await sendReceiptOnce(payment.id);
  return issued;
}

/** Claims the receipt first, so two callers can't both send it; gives the claim back if sending fails. */
async function sendReceiptOnce(paymentId: string) {
  const db = adminClient();
  const { data: claimed } = await db
    .from("payments")
    .update({ receipt_sent_at: new Date().toISOString() })
    .eq("id", paymentId)
    .is("receipt_sent_at", null)
    .select("id, txnid, billing, amount_minor, currency, display_amount_minor, display_currency, verified_at, letters(id, name, correction_until, companies(legal_name))")
    .maybeSingle();
  if (!claimed?.letters) return;

  const billing = claimed.billing as { fullName?: string; email?: string };
  if (!billing.email) return;
  const charged = { currency: claimed.currency, amountMinor: claimed.amount_minor };
  const shown = claimed.display_currency && claimed.display_amount_minor ? { currency: claimed.display_currency, amountMinor: claimed.display_amount_minor } : charged;
  const day = (iso: string | null) => (iso ? formatDay(iso) : "");

  const sent = await sendEmail(
    receiptEmail({
      to: billing.email,
      name: billing.fullName || "there",
      reference: claimed.txnid,
      paidOn: day(claimed.verified_at),
      price: formatMoney(shown),
      charged: formatMoney(charged),
      letterName: claimed.letters.name,
      companyName: claimed.letters.companies?.legal_name ?? "",
      letterUrl: `${appUrl()}/letters/${claimed.letters.id}`,
      receiptUrl: `${appUrl()}/receipts/${claimed.txnid}`,
      correctionsUntil: day(claimed.letters.correction_until),
    }),
  );
  if (!sent) await db.from("payments").update({ receipt_sent_at: null }).eq("id", paymentId);
}
