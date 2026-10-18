import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { CheckoutHeader } from "@/components/checkout/checkout-header";
import { PaymentStatus } from "@/components/checkout/payment-status";
import { requireUser } from "@/lib/auth";
import { formatMoney } from "@/lib/payments/prices.server";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Payment" };

// Where PayU sends people back after paying a website invoice (the onboarding fee or a monthly invoice).
export default async function WebsitePaymentPage({ params }: PageProps<"/website/payments/[txnid]">) {
  const { txnid } = await params;
  const user = await requireUser(`/website/payments/${txnid}`);
  if (!/^[A-Za-z0-9_-]{8,40}$/.test(txnid)) notFound();

  const supabase = await createClient();
  const { data: payment } = await supabase
    .from("payments")
    .select("txnid, status, failure_reason, amount_minor, currency, created_at, invoice_id, invoices!payments_invoice_id_fkey(status, subscription_id)")
    .eq("txnid", txnid)
    .eq("user_id", user.id)
    .eq("kind", "invoice")
    .maybeSingle();
  if (!payment?.invoice_id || !payment.invoices) notFound();

  return (
    <div className="min-h-dvh bg-canvas">
      <CheckoutHeader back={{ href: `/website/${payment.invoices.subscription_id}`, label: "Your website" }} />
      <main className="mx-auto max-w-[640px] px-4 py-8 md:py-14">
        <PaymentStatus
          target={{ kind: "invoice", subscriptionId: payment.invoices.subscription_id, invoiceId: payment.invoice_id }}
          txnid={payment.txnid}
          initial={{ status: payment.status, failureReason: payment.failure_reason, ready: payment.invoices.status === "paid" }}
          amount={formatMoney({ currency: payment.currency, amountMinor: payment.amount_minor })}
          startedAt={payment.created_at}
        />
      </main>
    </div>
  );
}
