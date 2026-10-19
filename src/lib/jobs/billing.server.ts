import "server-only";
import { sendEmail } from "@/lib/email/send.server";
import { formatMoney } from "@/lib/payments/prices.server";
import { appUrl } from "@/lib/payu/gateway.server";
import { adminClient } from "@/lib/supabase/admin";
import { formatDay } from "@/lib/template/format";
import { subscriptionContact } from "@/lib/websites/contact.server";
import { invoiceOverdueEmail, invoiceReadyEmail } from "@/lib/websites/emails";
import { GRACE_DAYS, ISSUE_DAYS_BEFORE } from "@/lib/websites/periods";

// "Run billing" (run by an admin from the panel): issues the website invoices due on the coming 1st, and any months
// missed, and emails them; plans with an invoice unpaid a week after its due date become past due. The database
// does the billing (issue_monthly_invoices, mark_overdue_subscriptions), so running it twice issues nothing twice.
// Run it daily, or at least from the 27th to the 1st and again around the 8th.

export type BillingSummary = { today: string; issued: number; overdue: number; emailed: number; errors: number };

export async function runBilling(today: string): Promise<BillingSummary> {
  const db = adminClient();
  const summary: BillingSummary = { today, issued: 0, overdue: 0, emailed: 0, errors: 0 };

  const issued = await db.rpc("issue_monthly_invoices", { p_today: today, p_days_ahead: ISSUE_DAYS_BEFORE });
  if (issued.error) throw new Error(`Couldn't issue invoices: ${issued.error.message}`);
  for (const invoice of issued.data ?? []) {
    summary.issued++;
    const who = await subscriptionContact(invoice.subscription_id);
    if (!who) continue;
    const sent = await sendEmail(
      invoiceReadyEmail({
        to: who.to,
        name: who.name,
        description: invoice.description,
        amount: formatMoney({ currency: invoice.currency, amountMinor: invoice.amount_minor }),
        dueOn: formatDay(invoice.due_on),
        payUrl: `${appUrl()}/website/invoices/${invoice.id}/pay`,
      }),
    );
    if (sent) summary.emailed++;
    else summary.errors++;
  }

  const overdue = await db.rpc("mark_overdue_subscriptions", { p_today: today, p_grace_days: GRACE_DAYS });
  if (overdue.error) throw new Error(`Couldn't mark overdue plans: ${overdue.error.message}`);
  for (const subscriptionId of overdue.data ?? []) {
    summary.overdue++;
    const { data: invoice } = await db
      .from("invoices")
      .select("id, description, amount_minor, currency, due_on")
      .eq("subscription_id", subscriptionId)
      .eq("status", "open")
      .order("due_on")
      .limit(1)
      .maybeSingle();
    await db.from("subscription_events").insert({ subscription_id: subscriptionId, kind: "past_due", message: "A payment is overdue. Please pay it to keep your website and email running." });
    const who = await subscriptionContact(subscriptionId);
    if (!who || !invoice) continue;
    const sent = await sendEmail(
      invoiceOverdueEmail({
        to: who.to,
        name: who.name,
        description: invoice.description,
        amount: formatMoney({ currency: invoice.currency, amountMinor: invoice.amount_minor }),
        dueOn: formatDay(invoice.due_on),
        payUrl: `${appUrl()}/website/invoices/${invoice.id}/pay`,
      }),
    );
    if (sent) summary.emailed++;
    else summary.errors++;
  }
  return summary;
}
