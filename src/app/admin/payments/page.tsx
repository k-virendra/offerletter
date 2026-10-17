import type { Metadata } from "next";
import Link from "next/link";
import { VerifyPaymentButton } from "@/components/admin/controls";
import { RefundForm } from "@/components/admin/forms";
import { SearchBox } from "@/components/admin/search-box";
import { AdminCard, AdminHeader, AdminTable, EmptyState, Pill, td, th } from "@/components/admin/ui";
import { age, PAYMENT_LABELS, shortDateTime } from "@/lib/admin/queries.server";
import { countryName } from "@/lib/countries";
import { formatMoney } from "@/lib/payments/prices.server";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Payments" };

const FILTERS = [
  { key: "all", label: "All" },
  { key: "open", label: "Pending" },
  { key: "success", label: "Paid" },
  { key: "failed", label: "Failed" },
  { key: "refunded", label: "Refunded" },
] as const;

const cleanQuery = (value: unknown) => (typeof value === "string" ? value.replace(/[^\p{L}\p{N}@.\-_ ]/gu, "").trim().slice(0, 80) : "");

export default async function AdminPaymentsPage({ searchParams }: PageProps<"/admin/payments">) {
  const params = await searchParams;
  const filter = FILTERS.find((f) => f.key === params.status)?.key ?? "all";
  const q = cleanQuery(params.q);
  const selected = typeof params.txnid === "string" && /^[A-Za-z0-9_-]{8,40}$/.test(params.txnid) ? params.txnid : null;
  const supabase = await createClient();

  let query = supabase.from("payments").select("txnid, status, amount_minor, currency, created_at, failure_reason, profiles(email), letters(name)").order("created_at", { ascending: false }).limit(100);
  if (filter === "open") query = query.in("status", ["initiated", "pending"]);
  else if (filter !== "all") query = query.eq("status", filter);
  if (q) {
    const { data: payers } = await supabase.from("profiles").select("id").ilike("email", `%${q}%`).limit(50);
    query = query.or(`txnid.ilike.%${q}%${payers?.length ? `,user_id.in.(${payers.map((p) => p.id).join(",")})` : ""}`);
  }
  const { data: payments } = await query;
  const link = (extra: Record<string, string>) => `/admin/payments?${new URLSearchParams({ status: filter, ...(q ? { q } : {}), ...extra })}`;

  return (
    <>
      <AdminHeader title="Payments" actions={<SearchBox path="/admin/payments" value={q} extra={{ status: filter }} label="Search payments" placeholder="Reference or payer email" />} />
      <nav aria-label="Filter payments" className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/admin/payments?${new URLSearchParams({ status: f.key, ...(q ? { q } : {}) })}`}
            aria-current={f.key === filter ? "page" : undefined}
            className={cn("inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold no-underline", f.key === filter ? "bg-ink text-white" : "bg-white text-ink-2 ring-1 ring-line hover:bg-ghost-hover")}
          >
            {f.label}
          </Link>
        ))}
      </nav>
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_440px]">
        <AdminCard>
          {payments?.length ? (
            <AdminTable caption="Payments" minWidth={620}>
              <thead>
                <tr>
                  <th className={th}>PayU transaction</th>
                  <th className={th}>Payer</th>
                  <th className={th}>Status</th>
                  <th className={`${th} text-right`}>Amount</th>
                </tr>
              </thead>
              <tbody>
                {payments.map((payment) => {
                  const label = PAYMENT_LABELS[payment.status];
                  return (
                    <tr key={payment.txnid} className={cn(payment.txnid === selected && "bg-hover-soft")}>
                      <td className={td}>
                        <Link href={link({ txnid: payment.txnid })} aria-current={payment.txnid === selected ? "true" : undefined} className="font-mono text-[13px] font-semibold text-ink underline-offset-2 hover:underline">
                          {payment.txnid}
                        </Link>
                        <p className="text-[13px] text-ink-2">{shortDateTime(payment.created_at)}</p>
                      </td>
                      <td className={`${td} break-all`}>
                        {payment.profiles?.email ?? "Deleted account"}
                        {payment.letters?.name ? <p className="text-[13px] text-ink-2">{payment.letters.name}</p> : null}
                      </td>
                      <td className={td}>
                        <Pill tone={label.tone}>
                          {label.text}
                          {payment.status === "pending" || payment.status === "initiated" ? ` · ${age(payment.created_at)}` : ""}
                        </Pill>
                        {payment.failure_reason ? <p className="mt-1 text-[13px] text-ink-2">{payment.failure_reason}</p> : null}
                      </td>
                      <td className={`${td} text-right tabular-nums`}>{formatMoney({ currency: payment.currency, amountMinor: payment.amount_minor })}</td>
                    </tr>
                  );
                })}
              </tbody>
            </AdminTable>
          ) : (
            <EmptyState>{q ? `No payment matches “${q}”.` : "No payments here."}</EmptyState>
          )}
        </AdminCard>
        {selected ? <PaymentDetail txnid={selected} /> : <EmptyState>Select a payment to see PayU’s responses, verify it or record a refund.</EmptyState>}
      </div>
    </>
  );
}

type LogEntry = Record<string, string | undefined>;
type Billing = { fullName?: string; email?: string; companyName?: string; country?: string; postalCode?: string; address?: string; authorised_at?: string };

async function PaymentDetail({ txnid }: { txnid: string }) {
  const supabase = await createClient();
  const { data: payment } = await supabase
    .from("payments")
    .select("id, txnid, status, amount_minor, currency, display_amount_minor, display_currency, payu_payment_id, billing, raw_responses, failure_reason, verified_at, refunded_at, refund_note, created_at, letter_id, profiles(email), letters(name, status, current_version), companies(id, legal_name)")
    .eq("txnid", txnid)
    .maybeSingle();
  if (!payment) return <EmptyState>No payment with this reference.</EmptyState>;
  const amount = formatMoney({ currency: payment.currency, amountMinor: payment.amount_minor });
  const shown = payment.display_currency && payment.display_amount_minor ? formatMoney({ currency: payment.display_currency, amountMinor: payment.display_amount_minor }) : amount;
  const billing = payment.billing as Billing;
  const log = (Array.isArray(payment.raw_responses) ? payment.raw_responses : []) as LogEntry[];
  const label = PAYMENT_LABELS[payment.status];

  return (
    <AdminCard className="flex flex-col gap-5 max-xl:order-first">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-mono text-lg font-semibold">{payment.txnid}</h2>
          <p className="text-sm text-ink-2">Started {shortDateTime(payment.created_at)}</p>
        </div>
        <Pill tone={label.tone}>{label.text}</Pill>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-muted">Amount</dt>
        <dd className="tabular-nums">{shown === amount ? amount : `${shown} shown · ${amount} charged`}</dd>
        <dt className="text-muted">Payer</dt>
        <dd className="break-all">{payment.profiles?.email ?? "Deleted account"}</dd>
        <dt className="text-muted">Letter</dt>
        <dd>
          {payment.letters ? `${payment.letters.name} · ${payment.letters.status === "paid" ? `paid, version ${payment.letters.current_version}` : "draft"}` : "Deleted"}
        </dd>
        {payment.companies ? (
          <>
            <dt className="text-muted">Company</dt>
            <dd>
              <Link href={`/admin/companies?id=${payment.companies.id}`} className="text-evergreen-700 underline underline-offset-2">
                {payment.companies.legal_name}
              </Link>
            </dd>
          </>
        ) : null}
        <dt className="text-muted">PayU id</dt>
        <dd className="font-mono text-[13px]">{payment.payu_payment_id ?? "–"}</dd>
        {payment.verified_at ? (
          <>
            <dt className="text-muted">Verified</dt>
            <dd>{shortDateTime(payment.verified_at)}</dd>
          </>
        ) : null}
        {payment.failure_reason ? (
          <>
            <dt className="text-muted">Reason</dt>
            <dd>{payment.failure_reason}</dd>
          </>
        ) : null}
        {payment.refunded_at ? (
          <>
            <dt className="text-muted">Refunded</dt>
            <dd>
              {shortDateTime(payment.refunded_at)}
              {payment.refund_note ? ` · ${payment.refund_note}` : ""}
            </dd>
          </>
        ) : null}
        <dt className="text-muted">Billed to</dt>
        <dd className="break-words">
          {[billing.fullName, billing.companyName, billing.address, [billing.postalCode, billing.country ? countryName(billing.country) : ""].filter(Boolean).join(" "), billing.email].filter(Boolean).join(", ")}
          {billing.authorised_at ? <span className="block text-[13px] text-ink-2">Confirmed their authority {shortDateTime(billing.authorised_at)}</span> : null}
        </dd>
      </dl>

      {payment.status === "pending" || payment.status === "initiated" || (payment.status === "success" && payment.letters?.status !== "paid") ? (
        <div className="flex flex-wrap items-center gap-3">
          <VerifyPaymentButton txnid={payment.txnid} variant="secondary" />
          <span className="text-[13px] text-ink-2">Asks PayU now, and finishes the letter if it’s paid.</span>
        </div>
      ) : null}
      {payment.status === "success" ? <RefundForm txnid={payment.txnid} amount={amount} /> : null}

      <div>
        <h3 className="text-sm font-semibold">PayU responses ({log.length})</h3>
        {log.length ? (
          <ol className="mt-2 flex flex-col gap-2">
            {log.map((entry, index) => (
              <li key={index} className="rounded-lg bg-canvas px-3 py-2 text-[13px]">
                <p className="font-semibold">
                  {entry.received_from ?? "unknown"} · {entry.status ?? "–"}
                  {entry.received_at ? <span className="font-normal text-ink-2"> · {shortDateTime(entry.received_at)}</span> : null}
                </p>
                <p className="font-mono text-xs break-all text-ink-2">
                  {Object.entries(entry)
                    .filter(([key]) => !["received_from", "received_at", "status"].includes(key))
                    .map(([key, value]) => `${key}=${value}`)
                    .join(" · ")}
                </p>
              </li>
            ))}
          </ol>
        ) : (
          <p className="mt-1 text-[13px] text-ink-2">Nothing from PayU yet: the customer may not have reached its page.</p>
        )}
      </div>
    </AdminCard>
  );
}
