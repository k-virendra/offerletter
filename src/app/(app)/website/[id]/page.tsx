import { Check, Circle, ExternalLink, TriangleAlert } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { z } from "zod";
import { Pill } from "@/components/admin/ui";
import { CancelButton } from "@/components/websites/cancel-button";
import { Button } from "@/components/ui/button";
import { requireUser } from "@/lib/auth";
import { formatMoney } from "@/lib/payments/prices.server";
import { formatDay } from "@/lib/template/format";
import { nextDueDate } from "@/lib/websites/periods";
import { ownSubscription, SUBSCRIPTION_LABELS } from "@/lib/websites/queries.server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Your website" };

const INVOICE_LABELS = { open: { text: "Due", tone: "warning" }, paid: { text: "Paid", tone: "success" }, void: { text: "Cancelled", tone: "neutral" } } as const;

export default async function WebsitePage({ params }: PageProps<"/website/[id]">) {
  const { id } = await params;
  const user = await requireUser(`/website/${id}`);
  if (!z.uuid().safeParse(id).success) notFound();
  const found = await ownSubscription(user.id, id);
  if (!found) notFound();
  const { subscription: s, invoices, events } = found;
  const label = SUBSCRIPTION_LABELS[s.status];
  const onboarding = invoices.find((i) => i.kind === "onboarding" && i.status !== "void");
  const open = invoices.filter((i) => i.status === "open");
  const next = nextDueDate(s.paid_through);
  const billingEmail = (s.billing as { email?: string }).email ?? user.email;
  const mailbox = s.mailbox_address ?? `${s.mailbox_name}@${s.domain ?? s.requested_domains[0]}`;

  const steps = [
    { done: onboarding?.status === "paid", title: "Order paid", detail: onboarding?.paid_at ? formatDay(onboarding.paid_at) : "Waiting for payment" },
    { done: Boolean(s.domain_ready_at), title: "Domain registered", detail: s.domain ?? `We’ll register ${s.requested_domains[0]} or your next choice` },
    { done: Boolean(s.website_ready_at), title: "Website live", detail: s.website_url ?? "We’re building it from your brief" },
    {
      done: Boolean(s.mailbox_ready_at),
      title: "Email ready",
      detail: s.mailbox_ready_at ? `${mailbox}: check ${billingEmail} for the invite to set your password` : `${mailbox}, once your domain is registered`,
    },
    { done: Boolean(s.activated_at), title: "All set", detail: s.activated_at ? `Since ${formatDay(s.activated_at)}` : "We’ll email you when everything is ready" },
  ];

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-2 text-[13px]">
            <Pill tone={label.tone}>{label.text}</Pill>
            <span className="text-ink-2">{s.plans?.name}</span>
          </p>
          <h1 className="mt-2 font-display text-4xl font-medium tracking-tight break-words">{s.companies?.legal_name ?? "Your website"}</h1>
          {s.website_url ? (
            <a href={s.website_url} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1.5 font-semibold text-evergreen-700 underline underline-offset-2">
              {s.domain ?? s.website_url}
              <ExternalLink aria-hidden className="size-4" />
            </a>
          ) : null}
        </div>
      </div>

      {s.status === "past_due" || s.status === "suspended" || s.status === "pending_payment" ? (
        <section role="status" className="flex flex-wrap items-start gap-3 rounded-xl border border-marigold-500 bg-marigold-100 px-5 py-4 text-sm text-marigold-800">
          <TriangleAlert aria-hidden className="mt-0.5 size-5 shrink-0" />
          <p className="min-w-0 flex-1">
            {s.status === "pending_payment"
              ? "Your order isn’t paid yet. Pay to get started."
              : s.status === "past_due"
                ? "A payment is overdue. Please pay it to keep your website and email running."
                : `Your website plan is suspended${s.status_reason ? `: ${s.status_reason}` : "."} Contact us to sort it out.`}
          </p>
          {open[0] ? (
            <Button asChild>
              <Link href={`/website/invoices/${open[0].id}/pay`} className="no-underline">
                Pay {formatMoney({ currency: open[0].currency, amountMinor: open[0].amount_minor })}
              </Link>
            </Button>
          ) : null}
        </section>
      ) : null}

      <div className="grid items-start gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="flex min-w-0 flex-col gap-5">
          <section aria-labelledby="progress-heading" className="rounded-xl border border-line bg-white p-5 shadow-card">
            <h2 id="progress-heading" className="text-base font-semibold">
              Progress
            </h2>
            <ol className="mt-3 flex flex-col">
              {steps.map((step) => (
                <li key={step.title} className="flex gap-3 border-t border-line-soft py-3 first:border-t-0">
                  <span
                    className={cn("mt-0.5 inline-flex size-6 shrink-0 items-center justify-center rounded-full", step.done ? "bg-evergreen-600 text-white" : "text-control ring-1 ring-control")}
                  >
                    {step.done ? <Check aria-hidden className="size-3.5" /> : <Circle aria-hidden className="size-2.5" />}
                    <span className="sr-only">{step.done ? "Done:" : "To do:"}</span>
                  </span>
                  <span className="min-w-0">
                    <span className={cn("block font-semibold", !step.done && "text-ink-2")}>{step.title}</span>
                    <span className="block text-sm break-words text-ink-2">{step.detail}</span>
                  </span>
                </li>
              ))}
            </ol>
          </section>

          <section aria-labelledby="updates-heading" className="rounded-xl border border-line bg-white p-5 shadow-card">
            <h2 id="updates-heading" className="text-base font-semibold">
              Updates
            </h2>
            {events.length ? (
              <ol className="mt-2 flex flex-col">
                {events.map((event) => (
                  <li key={event.id} className="border-t border-line-soft py-2.5 text-sm first:border-t-0">
                    <p className="whitespace-pre-line">{event.message}</p>
                    <p className="text-[13px] text-muted">{formatDay(event.created_at)}</p>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="mt-1 text-sm text-ink-2">Nothing yet.</p>
            )}
          </section>
        </div>

        <div className="flex flex-col gap-5">
          <section aria-labelledby="billing-heading" className="rounded-xl border border-line bg-white p-5 shadow-card">
            <h2 id="billing-heading" className="text-base font-semibold">
              Billing
            </h2>
            <dl className="mt-2 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
              <dt className="text-muted">Plan</dt>
              <dd>{s.plans ? `${formatMoney({ currency: s.plans.currency, amountMinor: s.plans.monthly_minor })} a month` : ""}</dd>
              {s.paid_through ? (
                <>
                  <dt className="text-muted">Paid until</dt>
                  <dd>{formatDay(s.paid_through)}</dd>
                </>
              ) : null}
              {next && s.status !== "cancelled" ? (
                <>
                  <dt className="text-muted">Next payment</dt>
                  <dd>Due {formatDay(next)}</dd>
                </>
              ) : null}
            </dl>
            <h3 className="mt-4 text-sm font-semibold">Invoices</h3>
            <ul className="mt-1 flex flex-col">
              {invoices.map((invoice) => {
                const state = INVOICE_LABELS[invoice.status];
                const txnid = invoice.payments?.txnid;
                return (
                  <li key={invoice.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line-soft py-2.5 text-sm first:border-t-0">
                    <span className="min-w-0">
                      <span className="block">{invoice.description}</span>
                      <span className="block text-[13px] text-muted">
                        {invoice.number} · {invoice.status === "paid" && invoice.paid_at ? `paid ${formatDay(invoice.paid_at)}` : `due ${formatDay(invoice.due_on)}`}
                      </span>
                    </span>
                    <span className="flex items-center gap-2">
                      <span className="tabular-nums">{formatMoney({ currency: invoice.currency, amountMinor: invoice.amount_minor })}</span>
                      {invoice.status === "open" ? (
                        <Button asChild size="md">
                          <Link href={`/website/invoices/${invoice.id}/pay`} className="no-underline">
                            Pay now
                          </Link>
                        </Button>
                      ) : invoice.status === "paid" && txnid ? (
                        <Link href={`/receipts/${txnid}`} className="font-semibold text-evergreen-700 underline underline-offset-2">
                          Receipt
                        </Link>
                      ) : (
                        <Pill tone={state.tone}>{state.text}</Pill>
                      )}
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>

          <section aria-labelledby="details-heading" className="rounded-xl border border-line bg-white p-5 shadow-card">
            <h2 id="details-heading" className="text-base font-semibold">
              What you asked for
            </h2>
            <dl className="mt-2 flex flex-col gap-2 text-sm">
              <div>
                <dt className="text-muted">Domains</dt>
                <dd>{s.requested_domains.join(", ")}</dd>
              </div>
              <div>
                <dt className="text-muted">Email address</dt>
                <dd className="break-all">{mailbox}</dd>
              </div>
              <div>
                <dt className="text-muted">About the business</dt>
                <dd className="whitespace-pre-line">{(s.brief as { about?: string }).about}</dd>
              </div>
            </dl>
            {s.status !== "cancelled" ? (
              <div className="mt-3 border-t border-line-soft pt-3">
                {s.cancel_requested_at ? (
                  <p className="text-[13px] text-ink-2">You asked to cancel on {formatDay(s.cancel_requested_at)}. Our team will contact you.</p>
                ) : (
                  <CancelButton subscriptionId={s.id} />
                )}
              </div>
            ) : null}
          </section>
        </div>
      </div>
    </div>
  );
}
