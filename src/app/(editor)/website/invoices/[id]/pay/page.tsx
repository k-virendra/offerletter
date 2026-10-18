import type { Metadata } from "next";
import { notFound, redirect } from "next/navigation";
import { z } from "zod";
import { payInvoice } from "@/app/(editor)/website/actions";
import { CheckoutForm, PolicyLinks } from "@/components/checkout/checkout-form";
import { CheckoutHeader } from "@/components/checkout/checkout-header";
import { getProfile, requireUser } from "@/lib/auth";
import { countryOptions } from "@/lib/countries";
import { formatMoney } from "@/lib/payments/prices.server";
import { createClient } from "@/lib/supabase/server";
import { formatDay } from "@/lib/template/format";

export const metadata: Metadata = { title: "Pay invoice" };

type Billing = { fullName?: string; email?: string; companyName?: string; country?: string; postalCode?: string; address?: string };

export default async function PayInvoicePage({ params }: PageProps<"/website/invoices/[id]/pay">) {
  const { id } = await params;
  const user = await requireUser(`/website/invoices/${id}/pay`);
  if (!z.uuid().safeParse(id).success) notFound();

  const supabase = await createClient();
  const { data: invoice } = await supabase
    .from("invoices")
    .select("id, number, description, amount_minor, currency, due_on, status, subscription_id, subscriptions(billing, companies(legal_name))")
    .eq("id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!invoice?.subscriptions) notFound();
  if (invoice.status !== "open") redirect(`/website/${invoice.subscription_id}`);
  const profile = await getProfile();
  const saved = invoice.subscriptions.billing as Billing;
  const amount = formatMoney({ currency: invoice.currency, amountMinor: invoice.amount_minor });

  return (
    <div className="min-h-dvh bg-canvas">
      <CheckoutHeader back={{ href: `/website/${invoice.subscription_id}`, label: "Your website" }} />
      <main className="mx-auto grid max-w-[1080px] items-start gap-5 px-4 py-6 md:px-6 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-x-10 lg:py-10">
        <div className="min-w-0 max-lg:order-1 lg:col-start-1">
          <p className="text-[13px] font-semibold text-evergreen-700">Invoice {invoice.number}</p>
          <h1 className="font-display text-[30px] leading-tight font-medium">Pay invoice</h1>
        </div>
        <div className="min-w-0 max-lg:order-3 lg:col-start-1">
          <CheckoutForm
            submit={payInvoice.bind(null, invoice.id)}
            pendingPath="/website/payments/"
            agreement={
              <>
                I agree to the <PolicyLinks />.
              </>
            }
            price={amount}
            countries={countryOptions()}
            defaults={{
              fullName: saved.fullName ?? profile?.full_name ?? "",
              email: saved.email ?? profile?.email ?? user.email ?? "",
              companyName: saved.companyName ?? invoice.subscriptions.companies?.legal_name ?? "",
              country: saved.country ?? "IN",
              postalCode: saved.postalCode ?? "",
              address: saved.address ?? "",
            }}
          />
        </div>
        <aside aria-labelledby="invoice-heading" className="rounded-xl border border-line bg-white p-5 shadow-card max-lg:order-2 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <h2 id="invoice-heading" className="text-base font-semibold">
            {invoice.description}
          </h2>
          {invoice.subscriptions.companies?.legal_name ? <p className="mt-0.5 text-sm text-ink-2">{invoice.subscriptions.companies.legal_name}</p> : null}
          <dl className="mt-4 flex flex-col gap-2 border-t border-line-soft pt-4 text-sm">
            <div className="flex justify-between gap-3">
              <dt className="text-ink-2">Due on</dt>
              <dd>{formatDay(invoice.due_on)}</dd>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <dt className="text-ink-2">Amount</dt>
              <dd className="font-display text-2xl font-medium tabular-nums">{amount}</dd>
            </div>
          </dl>
        </aside>
      </main>
    </div>
  );
}
