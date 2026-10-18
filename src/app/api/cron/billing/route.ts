import { cronAuthorised } from "@/lib/cron.server";
import { sendEmail } from "@/lib/email/send.server";
import { isLocalStack } from "@/lib/env.server";
import { formatMoney } from "@/lib/payments/prices.server";
import { appUrl } from "@/lib/payu/gateway.server";
import { adminClient } from "@/lib/supabase/admin";
import { formatDay, todayIso } from "@/lib/template/format";
import { subscriptionContact } from "@/lib/websites/contact.server";
import { invoiceOverdueEmail, invoiceReadyEmail } from "@/lib/websites/emails";
import { GRACE_DAYS, ISSUE_DAYS_BEFORE } from "@/lib/websites/periods";

// Daily (vercel.json): issues website invoices due on the coming 1st (and any missed months), emails them, and
// marks plans with an invoice unpaid a week after its due date as past due. The database does the billing
// (issue_monthly_invoices, mark_overdue_subscriptions) so a repeated or overlapping run issues nothing twice.

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!cronAuthorised(request)) return Response.json({ error: "Unauthorised" }, { status: 401 });
  // Tests move the clock; only against a local stack.
  const requested = new URL(request.url).searchParams.get("today");
  const today = requested && isLocalStack() && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : todayIso();
  const db = adminClient();
  const summary = { today, issued: 0, overdue: 0, emailed: 0, errors: 0 };

  const issued = await db.rpc("issue_monthly_invoices", { p_today: today, p_days_ahead: ISSUE_DAYS_BEFORE });
  if (issued.error) return Response.json({ error: issued.error.message }, { status: 500 });
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
  if (overdue.error) return Response.json({ error: overdue.error.message }, { status: 500 });
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
  return Response.json(summary);
}
