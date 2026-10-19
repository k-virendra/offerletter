"use client";

import { CircleCheck, CircleX, Download, Hourglass, Loader2, RefreshCw } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";

// The page PayU sends people back to. It shows what PayU has confirmed and, until that's final, asks again every
// 12 seconds (and on "Check now").

export type PaymentView = { status: "initiated" | "pending" | "success" | "failed" | "refunded"; failureReason: string | null; ready: boolean };

const POLL_SECONDS = 12;

/** What the payment was for: an offer letter, or an invoice for a business website. */
export type PaymentTarget =
  /** `translation`: the letter also comes in this language ({ code: "de", name: "German" }). */
  | { kind: "letter"; letterId: string; translation?: { code: string; name: string } }
  | { kind: "invoice"; subscriptionId: string; invoiceId: string };

export function PaymentStatus({
  target,
  txnid,
  initial,
  amount,
  startedAt,
}: {
  target: PaymentTarget;
  txnid: string;
  initial: PaymentView;
  amount: string;
  startedAt: string;
}) {
  const [view, setView] = useState(initial);
  const [checking, setChecking] = useState(false);
  const [seconds, setSeconds] = useState(POLL_SECONDS);
  const [longWait, setLongWait] = useState(false);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const settled = view.status === "failed" || view.status === "refunded" || (view.status === "success" && view.ready);

  const check = useCallback(async () => {
    setChecking(true);
    try {
      const response = await fetch(`/api/payments/${encodeURIComponent(txnid)}/check`, { method: "POST", cache: "no-store" });
      if (response.ok) {
        const next = (await response.json()) as PaymentView;
        setView((current) => (current.status === next.status && current.ready === next.ready ? current : next));
      }
    } catch {
      // Offline for a moment: the next check tries again.
    } finally {
      setChecking(false);
      setSeconds(POLL_SECONDS);
      setLongWait(Date.now() - new Date(startedAt).getTime() > 10 * 60_000);
    }
  }, [txnid, startedAt]);

  useEffect(() => {
    if (settled || checking) return;
    const timer = window.setTimeout(() => {
      if (seconds <= 1) void check();
      else setSeconds(seconds - 1);
    }, 1000);
    return () => window.clearTimeout(timer);
  }, [settled, checking, seconds, check]);

  // A new outcome is announced by moving focus to its heading.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    headingRef.current?.focus();
  }, [view.status, view.ready]);

  const reference = (
    <dl className="mt-6 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 border-t border-line-soft pt-4 text-sm">
      <dt className="text-muted">Amount</dt>
      <dd className="tabular-nums">{amount}</dd>
      <dt className="text-muted">Reference</dt>
      <dd className="font-mono text-[13px] break-all">{txnid}</dd>
    </dl>
  );

  if (view.status === "success" || view.status === "refunded") {
    return (
      <Card tone="success" icon={<CircleCheck aria-hidden className="size-7" />}>
        <h1 ref={headingRef} tabIndex={-1} className="font-display text-[28px] leading-tight font-medium outline-none">
          {view.status === "refunded"
            ? "This payment was refunded"
            : target.kind === "invoice"
              ? "Payment received. Thank you!"
              : view.ready
                ? "Payment received. Your letter is ready."
                : "Payment received. Preparing your letter…"}
        </h1>
        {view.status === "refunded" ? (
          <p className="mt-2 text-ink-2">{target.kind === "letter" ? "The letter stays in your account, but it can’t be corrected any more." : "The refund goes back to the card or account you paid with."}</p>
        ) : target.kind === "invoice" ? (
          <>
            <p className="mt-2 text-ink-2">We’ve emailed your receipt. You can follow your website’s progress and see your invoices on its page.</p>
            <div className="mt-5 flex flex-wrap gap-2.5">
              <Button asChild size="lg">
                <Link href={`/website/${target.subscriptionId}`}>Open your website page</Link>
              </Button>
            </div>
          </>
        ) : view.ready ? (
          <>
            <p className="mt-2 text-ink-2">
              We’ve emailed your receipt. You can download the PDF now or any time from the letter’s page.
              {target.translation ? ` It comes in English and ${target.translation.name}; the English version prevails.` : ""}
            </p>
            <div className="mt-5 flex flex-wrap gap-2.5">
              <Button asChild size="lg">
                <a href={`/api/letters/${target.letterId}/versions/1/pdf`}>
                  <Download aria-hidden />
                  Download PDF
                </a>
              </Button>
              {target.translation ? (
                <Button asChild size="lg" variant="secondary">
                  <a href={`/api/letters/${target.letterId}/versions/1/pdf?lang=${target.translation.code}`}>
                    <Download aria-hidden />
                    {target.translation.name} translation
                  </a>
                </Button>
              ) : null}
              <Button asChild size="lg" variant="secondary">
                <Link href={`/letters/${target.letterId}`}>Open the letter</Link>
              </Button>
            </div>
          </>
        ) : (
          <p className="mt-2 flex items-center gap-2 text-ink-2">
            <Loader2 aria-hidden className="size-4 animate-spin motion-reduce:animate-none" />
            Making the final PDF. This takes a few seconds.
          </p>
        )}
        {reference}
        <p className="mt-3 text-sm">
          <Link href={`/receipts/${txnid}`} className="font-semibold text-evergreen-700 underline underline-offset-2">
            View the receipt
          </Link>
        </p>
      </Card>
    );
  }

  if (view.status === "failed") {
    return (
      <Card tone="danger" icon={<CircleX aria-hidden className="size-7" />}>
        <h1 ref={headingRef} tabIndex={-1} className="font-display text-[28px] leading-tight font-medium outline-none">
          The payment didn’t go through
        </h1>
        <p className="mt-2 text-ink-2">
          {view.failureReason ?? "PayU couldn’t complete the payment."}{" "}
          {target.kind === "letter" ? "Your letter is saved as a draft, so you can try again." : "Nothing was charged for it, and you can try again."}
        </p>
        <div className="mt-5 flex flex-wrap gap-2.5">
          <Button asChild size="lg">
            <Link href={target.kind === "letter" ? `/letters/${target.letterId}/checkout` : `/website/invoices/${target.invoiceId}/pay`}>Try again</Link>
          </Button>
          <Button asChild size="lg" variant="secondary">
            <Link href={target.kind === "letter" ? `/letters/${target.letterId}/edit` : `/website/${target.subscriptionId}`}>
              {target.kind === "letter" ? "Back to the letter" : "Back to your website page"}
            </Link>
          </Button>
        </div>
        {reference}
        <p className="mt-3 text-[13px] text-muted">If your bank shows a charge for this attempt, it’s normally reversed within a few working days. Quote the reference if you contact us.</p>
      </Card>
    );
  }

  return (
    <Card tone="info" icon={<Hourglass aria-hidden className="size-7" />}>
      <h1 ref={headingRef} tabIndex={-1} className="font-display text-[28px] leading-tight font-medium outline-none">
        We’re confirming your payment
      </h1>
      <p className="mt-2 text-ink-2">
        PayU is still confirming it with your bank. This page updates by itself: there’s no need to pay again.
        {longWait ? " Some payment methods take longer. You can leave this page: we’ll email your receipt once it’s confirmed, and the letter will be in your letters." : ""}
      </p>
      <div className="mt-5 flex flex-wrap items-center gap-3">
        <Button variant="secondary" onClick={() => void check()} disabled={checking}>
          {checking ? <Loader2 aria-hidden className="animate-spin motion-reduce:animate-none" /> : <RefreshCw aria-hidden />}
          Check now
        </Button>
        <span className="text-sm text-muted tabular-nums">{checking ? "Checking…" : `Checking again in ${seconds} s`}</span>
      </div>
      {reference}
    </Card>
  );
}

function Card({ tone, icon, children }: { tone: "success" | "danger" | "info"; icon: React.ReactNode; children: React.ReactNode }) {
  const color = { success: "bg-evergreen-50 text-evergreen-700", danger: "bg-danger-50 text-danger", info: "bg-info-50 text-info" }[tone];
  return (
    <section className="rounded-xl border border-line bg-white p-6 shadow-card md:p-8">
      <span className={`mb-4 inline-flex size-12 items-center justify-center rounded-full ${color}`}>{icon}</span>
      {children}
    </section>
  );
}
