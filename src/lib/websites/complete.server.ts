import "server-only";
import { sendEmail } from "@/lib/email/send.server";
import { serverEnv } from "@/lib/env.server";
import { formatMoney } from "@/lib/payments/prices.server";
import { appUrl } from "@/lib/payu/gateway.server";
import { adminClient } from "@/lib/supabase/admin";
import { formatDay } from "@/lib/template/format";
import { invoicePaidEmail, newOrderAlert, orderReceivedEmail } from "./emails";

// A confirmed PayU payment for a website invoice: the invoice is settled and its subscription moved on in one
// database transaction (settle_invoice), then the emails go out once. Safe to repeat, like letters.

export async function completeInvoicePayment(paymentId: string): Promise<string | null> {
  const db = adminClient();
  const { data: payment } = await db.from("payments").select("id, txnid, status, kind, invoice_id, verified_at, receipt_sent_at").eq("id", paymentId).maybeSingle();
  if (!payment || payment.status !== "success" || payment.kind !== "invoice" || !payment.invoice_id) return null;

  const { data: result, error } = await db.rpc("settle_invoice", { p_invoice: payment.invoice_id, p_payment: payment.id, p_paid_at: payment.verified_at ?? new Date().toISOString() });
  if (error) throw new Error(`Couldn't settle the invoice: ${error.message}`);
  // Two payments for one invoice (two tabs): the second is recorded, and support refunds it.
  if (result === "paid_twice") console.error("an invoice was paid twice; refund one payment", payment.txnid);
  if (result === "void") console.error("a void invoice was paid; refund it", payment.txnid);
  if (!payment.receipt_sent_at && result !== "paid_twice" && result !== "void") await sendNoticesOnce(payment.id);
  return result;
}

/** Claims the receipt first, so two callers can't both send it; gives the claim back if sending fails. */
async function sendNoticesOnce(paymentId: string) {
  const db = adminClient();
  const { data: claimed } = await db
    .from("payments")
    .update({ receipt_sent_at: new Date().toISOString() })
    .eq("id", paymentId)
    .is("receipt_sent_at", null)
    .select("txnid, billing, amount_minor, currency, verified_at, invoices!payments_invoice_id_fkey(kind, description, subscription_id, subscriptions(id, requested_domains, companies(legal_name), profiles(email)))")
    .maybeSingle();
  const invoice = claimed?.invoices;
  if (!claimed || !invoice) return;

  const billing = claimed.billing as { fullName?: string; email?: string };
  const to = billing.email ?? invoice.subscriptions?.profiles?.email;
  if (!to) return;
  const name = billing.fullName || "there";
  const amount = formatMoney({ currency: claimed.currency, amountMinor: claimed.amount_minor });
  const dashboardUrl = `${appUrl()}/website/${invoice.subscription_id}`;
  const receiptUrl = `${appUrl()}/receipts/${claimed.txnid}`;

  const sent =
    invoice.kind === "onboarding"
      ? await sendEmail(orderReceivedEmail({ to, name, amount, reference: claimed.txnid, domains: invoice.subscriptions?.requested_domains ?? [], dashboardUrl, receiptUrl }))
      : await sendEmail(
          invoicePaidEmail({ to, name, description: invoice.description, amount, reference: claimed.txnid, paidOn: claimed.verified_at ? formatDay(claimed.verified_at) : "", dashboardUrl, receiptUrl }),
        );
  if (!sent) {
    await db.from("payments").update({ receipt_sent_at: null }).eq("id", paymentId);
    return;
  }

  const team = serverEnv().ADMIN_NOTIFY_EMAIL;
  if (invoice.kind === "onboarding" && team) {
    await sendEmail(
      newOrderAlert(team, {
        business: invoice.subscriptions?.companies?.legal_name ?? "A business",
        customer: to,
        domains: invoice.subscriptions?.requested_domains ?? [],
        adminUrl: `${appUrl()}/admin/websites?id=${invoice.subscription_id}`,
      }),
    );
  }
}
