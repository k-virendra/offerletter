import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { z } from "zod";
import { CheckoutHeader } from "@/components/checkout/checkout-header";
import { PaymentStatus } from "@/components/checkout/payment-status";
import { requireUser } from "@/lib/auth";
import { languageName } from "@/lib/letter/translation";
import { formatMoney } from "@/lib/payments/prices.server";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Payment" };

export default async function PaymentStatusPage({ params }: PageProps<"/letters/[id]/checkout/[txnid]">) {
  const { id, txnid } = await params;
  const user = await requireUser(`/letters/${id}/checkout/${txnid}`);
  if (!z.uuid().safeParse(id).success || !/^[A-Za-z0-9_-]{8,40}$/.test(txnid)) notFound();

  // RLS: the payer reads their own payments and letters.
  const supabase = await createClient();
  const { data: payment } = await supabase
    .from("payments")
    .select("txnid, status, failure_reason, amount_minor, currency, display_amount_minor, display_currency, created_at, language:letter_snapshot->translation->>language")
    .eq("txnid", txnid)
    .eq("letter_id", id)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!payment) notFound();
  const { data: first } = await supabase.from("letter_versions").select("pdf_path").eq("letter_id", id).eq("version", 1).maybeSingle();

  const charged = formatMoney({ currency: payment.currency, amountMinor: payment.amount_minor });
  const shown = payment.display_currency && payment.display_amount_minor ? formatMoney({ currency: payment.display_currency, amountMinor: payment.display_amount_minor }) : charged;

  return (
    <div className="min-h-dvh bg-canvas">
      <CheckoutHeader back={{ href: "/dashboard", label: "Your letters" }} />
      <main className="mx-auto max-w-[640px] px-4 py-8 md:py-14">
        <PaymentStatus
          target={{ kind: "letter", letterId: id, translation: payment.language ? { code: payment.language, name: languageName(payment.language, "en") } : undefined }}
          txnid={payment.txnid}
          initial={{ status: payment.status, failureReason: payment.failure_reason, ready: Boolean(first?.pdf_path) }}
          amount={shown === charged ? charged : `${shown} (charged as ${charged})`}
          startedAt={payment.created_at}
        />
      </main>
    </div>
  );
}
