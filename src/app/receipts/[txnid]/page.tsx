import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/checkout/print-button";
import { Wordmark } from "@/components/logo";
import { requireUser } from "@/lib/auth";
import { countryName } from "@/lib/countries";
import { serverEnv } from "@/lib/env.server";
import { formatMoney } from "@/lib/payments/prices.server";
import { createClient } from "@/lib/supabase/server";
import { formatDay as day } from "@/lib/template/format";

// A payment's receipt, for the payer. Outside the app layouts so the browser's print command prints it.

export const metadata: Metadata = { title: "Receipt", robots: { index: false } };

const METHODS: Record<string, string> = { CC: "Credit card", DC: "Debit card", NB: "Net banking", UPI: "UPI", CASH: "Wallet", EMI: "EMI", PAYPAL: "PayPal" };

type Billing = { fullName?: string; email?: string; companyName?: string; country?: string; postalCode?: string; address?: string };

export default async function ReceiptPage({ params }: PageProps<"/receipts/[txnid]">) {
  const { txnid } = await params;
  const user = await requireUser(`/receipts/${txnid}`);
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(txnid)) notFound();

  // RLS: the payer reads their own payments.
  const supabase = await createClient();
  const { data: payment } = await supabase
    .from("payments")
    .select(
      "txnid, kind, status, amount_minor, currency, display_amount_minor, display_currency, billing, raw_responses, verified_at, refunded_at, letter_id, letters(name), companies(legal_name), invoices!payments_invoice_id_fkey(number, description, subscription_id)",
    )
    .eq("txnid", txnid)
    .eq("user_id", user.id)
    .in("status", ["success", "refunded"])
    .maybeSingle();
  if (!payment || !payment.verified_at) notFound();

  const billing = payment.billing as Billing;
  const responses = (Array.isArray(payment.raw_responses) ? payment.raw_responses : []) as { mode?: string }[];
  const mode = responses.map((r) => r.mode).find((m): m is string => typeof m === "string" && m in METHODS);
  const charged = formatMoney({ currency: payment.currency, amountMinor: payment.amount_minor });
  const price = payment.display_currency && payment.display_amount_minor ? formatMoney({ currency: payment.display_currency, amountMinor: payment.display_amount_minor }) : charged;
  const seller = serverEnv().RECEIPT_SELLER?.split("|").map((line) => line.trim()).filter(Boolean) ?? [];
  const billedTo = [billing.fullName, billing.companyName, billing.address, [billing.postalCode, billing.country ? countryName(billing.country) : ""].filter(Boolean).join(" "), billing.email].filter(
    (line): line is string => Boolean(line),
  );

  return (
    <div className="min-h-dvh bg-canvas print:bg-white">
      <main className="mx-auto max-w-[720px] px-4 py-8 md:py-12 print:p-0">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 print:hidden">
          {payment.kind === "invoice" && payment.invoices ? (
            <Link href={`/website/${payment.invoices.subscription_id}`} className="text-sm font-semibold text-evergreen-700 underline underline-offset-2">
              Back to your website page
            </Link>
          ) : payment.letter_id ? (
            <Link href={`/letters/${payment.letter_id}`} className="text-sm font-semibold text-evergreen-700 underline underline-offset-2">
              Back to the letter
            </Link>
          ) : (
            <span />
          )}
          <PrintButton />
        </div>

        <article className="rounded-xl border border-line bg-white p-6 shadow-card md:p-10 print:border-0 print:p-0 print:shadow-none">
          <header className="flex flex-wrap items-start justify-between gap-6 border-b border-line pb-6">
            <div>
              <Wordmark />
              {seller.length ? (
                <address className="mt-3 text-[13px] leading-relaxed text-ink-2 not-italic">
                  {seller.map((line) => (
                    <span key={line} className="block">
                      {line}
                    </span>
                  ))}
                </address>
              ) : null}
            </div>
            <div className="text-right">
              <h1 className="font-display text-3xl font-medium">Receipt</h1>
              <p className="mt-1 font-mono text-[13px]">{payment.txnid}</p>
              <p className="mt-1 text-sm text-ink-2">Paid on {day(payment.verified_at)}</p>
            </div>
          </header>

          <section className="grid gap-6 border-b border-line py-6 sm:grid-cols-2">
            <div>
              <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">Billed to</h2>
              <address className="mt-1.5 text-sm leading-relaxed whitespace-pre-line not-italic">{billedTo.join("\n")}</address>
            </div>
            <div className="sm:text-right">
              <h2 className="text-xs font-semibold tracking-wide text-muted uppercase">Payment</h2>
              <p className="mt-1.5 text-sm">
                {payment.status === "refunded" ? `Refunded${payment.refunded_at ? ` on ${day(payment.refunded_at)}` : ""}` : "Paid"} through PayU
                {mode ? ` · ${METHODS[mode]}` : ""}
              </p>
            </div>
          </section>

          <table className="w-full border-collapse text-sm">
            <caption className="sr-only">Items</caption>
            <thead>
              <tr className="text-left text-muted">
                <th scope="col" className="py-3 text-xs font-semibold tracking-wide uppercase">
                  Item
                </th>
                <th scope="col" className="py-3 text-right text-xs font-semibold tracking-wide uppercase">
                  Amount
                </th>
              </tr>
            </thead>
            <tbody>
              <tr className="border-t border-line-soft">
                <td className="py-3 pr-4">
                  {payment.kind === "invoice" ? (payment.invoices?.description ?? "Business website") : `Offer letter: ${payment.letters?.name ?? "deleted letter"}`}
                  {payment.companies?.legal_name ? <span className="block text-ink-2">{payment.companies.legal_name}</span> : null}
                  <span className="block text-[13px] text-muted">
                    {payment.kind === "invoice" ? `Invoice ${payment.invoices?.number ?? ""}` : "Final PDF and free corrections for 7 days"}
                  </span>
                </td>
                <td className="py-3 text-right align-top tabular-nums">{price}</td>
              </tr>
            </tbody>
            <tfoot>
              <tr className="border-t border-line">
                <th scope="row" className="py-3 text-left font-semibold">
                  Total
                </th>
                <td className="py-3 text-right font-semibold tabular-nums">{price}</td>
              </tr>
              {price === charged ? null : (
                <tr>
                  <th scope="row" className="pb-3 text-left font-normal text-ink-2">
                    Charged by PayU, in Indian rupees
                  </th>
                  <td className="pb-3 text-right text-ink-2 tabular-nums">{charged}</td>
                </tr>
              )}
            </tfoot>
          </table>

          <p className="mt-6 border-t border-line pt-4 text-[13px] text-muted">Questions about this payment? Quote the reference {payment.txnid}.</p>
        </article>
      </main>
    </div>
  );
}
