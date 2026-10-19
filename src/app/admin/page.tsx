import type { Metadata } from "next";
import Link from "next/link";
import { setCountryEnabled } from "@/app/admin/actions";
import { ToggleAction, VerifyPaymentButton } from "@/components/admin/controls";
import { RunJobButton } from "@/components/admin/run-job-button";
import { CountryStatus } from "@/components/admin/country-status";
import { PeriodSelect } from "@/components/admin/period-select";
import { AdminCard, AdminHeader, AdminTable, EmptyState, Metric, Pill, td, th } from "@/components/admin/ui";
import { age, countryReadiness, lastJobRuns, monthPeriod, PAYMENT_LABELS, periodMetrics, recentMonths, shortDateTime, websiteCounts } from "@/lib/admin/queries.server";
import { todayIso } from "@/lib/template/format";
import { formatMoney } from "@/lib/payments/prices.server";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Overview" };

const linkClass = "text-sm font-semibold text-evergreen-700 underline underline-offset-2";

export default async function AdminOverviewPage({ searchParams }: PageProps<"/admin">) {
  const { period: periodKey } = await searchParams;
  const period = monthPeriod(typeof periodKey === "string" ? periodKey : undefined);
  const supabase = await createClient();
  const [metrics, countries, reports, payments, prices, websites, jobs] = await Promise.all([
    periodMetrics(period),
    countryReadiness(),
    supabase.from("abuse_reports").select("id, company_name, description, status, created_at, updated_at, profiles(email)").order("created_at", { ascending: false }).limit(3),
    supabase.from("payments").select("txnid, status, amount_minor, currency, created_at, failure_reason").order("created_at", { ascending: false }).limit(5),
    supabase.from("prices").select("id, purpose, currency, amount_minor, active, notes").order("active", { ascending: false }).order("created_at", { ascending: false }).limit(4),
    websiteCounts(todayIso()),
    lastJobRuns(),
  ]);
  const change = metrics.lettersPaidChange;

  return (
    <>
      <AdminHeader title="Overview" actions={<PeriodSelect value={period.key} options={recentMonths().map((p) => ({ key: p.key, label: p.label }))} />} />

      <h2 className="mb-2 text-sm font-semibold text-ink-2">Business websites</h2>
      <div className="mb-6 grid grid-cols-2 gap-4 xl:grid-cols-4">
        <Link href="/admin/websites?status=setup" className="no-underline">
          <Metric label="To set up" value={websites.setup} note="Paid, waiting for the team" noteTone={websites.setup ? "info" : "muted"} />
        </Link>
        <Link href="/admin/websites?status=active" className="no-underline">
          <Metric label="Active" value={websites.active} />
        </Link>
        <Link href="/admin/websites?status=past_due" className="no-underline">
          <Metric label="Past due" value={websites.pastDue} noteTone="danger" note={websites.pastDue ? "Payment overdue a week or more" : "None overdue"} />
        </Link>
        <Metric label="Domains to renew" value={websites.expiring} note="Expiring within 30 days" noteTone={websites.expiring ? "danger" : "muted"} />
      </div>

      <h2 className="mb-2 text-sm font-semibold text-ink-2">Offer letters and payments</h2>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric
          label="Letters paid"
          value={metrics.lettersPaid}
          note={change === null ? "Nothing to compare with yet" : `${change >= 0 ? "+" : ""}${change}% on the month before`}
          noteTone={change !== null && change < 0 ? "danger" : "success"}
        />
        <Metric label="Revenue" value={metrics.revenue} note={metrics.refunds.count ? `${metrics.refunds.count} ${metrics.refunds.count === 1 ? "refund" : "refunds"} · ${metrics.refunds.total}` : "No refunds"} />
        <Metric
          label="Draft to paid"
          value={metrics.draftToPaid === null ? "–" : `${metrics.draftToPaid}%`}
          note={`Checkout to paid: ${metrics.checkoutToPaid === null ? "–" : `${metrics.checkoutToPaid}%`}`}
        />
        <Metric label="Payments pending" value={metrics.pending} note="Run “Check payments” below to ask PayU again" noteTone="info" />
      </div>

      <AdminCard id="jobs" title="Periodic jobs" className="mt-5">
        <p className="-mt-1 mb-3 text-sm text-ink-2">Nothing runs on a schedule: run these by hand. Both are safe to run as often as you like.</p>
        <ul className="grid gap-4 md:grid-cols-2">
          {(
            [
              {
                job: "billing",
                label: "Run billing",
                what: "Issues website invoices due on the coming 1st (from 5 days before) and marks plans past due a week after. Run it daily, or at least from the 27th to the 1st and around the 8th.",
              },
              {
                job: "payment-check",
                label: "Check payments",
                what: "Asks PayU about payments still pending, finishes paid letters and invoices whose PDF or email didn’t go out, and closes checkouts abandoned for a day.",
              },
            ] as const
          ).map(({ job, label, what }) => {
            const last = jobs[job];
            return (
              <li key={job} className="flex flex-col gap-2 rounded-xl border border-line-soft p-4">
                <p className="text-sm">{what}</p>
                <p className="text-[13px] text-muted">
                  {last ? `Last run ${shortDateTime(last.at)}${last.by ? ` by ${last.by}` : ""}` : "Not run yet"}
                </p>
                <div>
                  <RunJobButton job={job} label={label} />
                </div>
              </li>
            );
          })}
        </ul>
      </AdminCard>

      <div className="mt-5 grid grid-cols-1 gap-5 xl:grid-cols-2">
        <AdminCard id="countries" title="Countries" action={<Link href="/admin/countries" className={linkClass}>Manage</Link>}>
          <ul className="flex flex-col">
            {countries
              .filter((c) => c.selectable || c.enabled)
              .slice(0, 6)
              .map((country) => (
                <li key={country.code} className="flex items-center justify-between gap-4 border-t border-line-soft py-3 first:border-t-0">
                  <div className="min-w-0 text-sm">
                    <p>
                      <span className="font-semibold">{country.label}</span>
                      <span className="text-ink-2">
                        {" "}
                        · {country.code} · {country.currency} · {country.paperSize === "a4" ? "A4" : "Letter"}
                      </span>
                    </p>
                    <CountryStatus missing={country.missing} required={country.required} inherited={country.inherited} />
                  </div>
                  <ToggleAction checked={country.enabled} label={`${country.label}: letters ${country.enabled ? "on" : "off"}`} action={setCountryEnabled.bind(null, country.code)} />
                </li>
              ))}
          </ul>
        </AdminCard>

        <AdminCard id="reports" title="Misuse reports" action={<Link href="/admin/reports" className={linkClass}>All reports</Link>}>
          {reports.data?.length ? (
            <ul className="flex flex-col">
              {reports.data.map((report) => (
                <li key={report.id} className="flex items-start gap-3 border-t border-line-soft py-3 first:border-t-0">
                  <Pill tone={report.status === "new" ? "danger" : report.status === "investigating" ? "warning" : "neutral"}>{REPORT_LABEL[report.status]}</Pill>
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="line-clamp-2 font-semibold">{report.description}</p>
                    <p className="text-ink-2">
                      {report.company_name ? `Names “${report.company_name}” · ` : ""}
                      {report.status === "closed" ? `closed ${shortDateTime(report.updated_at)}${report.profiles?.email ? ` by ${report.profiles.email}` : ""}` : `reported ${shortDateTime(report.created_at)}`}
                    </p>
                  </div>
                  {report.status !== "closed" ? (
                    <Link href={`/admin/reports?id=${report.id}`} className={linkClass}>
                      Review
                    </Link>
                  ) : null}
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState>No misuse reports yet.</EmptyState>
          )}
        </AdminCard>

        <AdminCard id="payments" title="Recent payments" action={<Link href="/admin/payments" className={linkClass}>All payments</Link>}>
          {payments.data?.length ? (
            <AdminTable caption="Recent payments" minWidth={480}>
              <thead>
                <tr>
                  <th className={th}>PayU transaction</th>
                  <th className={th}>Status</th>
                  <th className={`${th} text-right`}>Amount</th>
                  <th className={`${th} text-right`}>Action</th>
                </tr>
              </thead>
              <tbody>
                {payments.data.map((payment) => {
                  const label = PAYMENT_LABELS[payment.status];
                  return (
                    <tr key={payment.txnid}>
                      <td className={`${td} font-mono text-[13px]`}>{payment.txnid}</td>
                      <td className={td}>
                        <Pill tone={label.tone}>
                          {label.text}
                          {payment.status === "pending" || payment.status === "initiated" ? ` · ${age(payment.created_at)}` : ""}
                        </Pill>
                      </td>
                      <td className={`${td} text-right tabular-nums`}>{formatMoney({ currency: payment.currency, amountMinor: payment.amount_minor })}</td>
                      <td className={`${td} text-right`}>
                        {payment.status === "pending" || payment.status === "initiated" ? (
                          <VerifyPaymentButton txnid={payment.txnid} />
                        ) : (
                          <Link href={`/admin/payments?txnid=${payment.txnid}`} className={linkClass}>
                            {payment.status === "success" ? "Record refund" : "Details"}
                          </Link>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </AdminTable>
          ) : (
            <EmptyState>No payments yet.</EmptyState>
          )}
        </AdminCard>

        <AdminCard id="prices" title="Prices" action={<Link href="/admin/prices" className={linkClass}>Manage</Link>}>
          <ul className="flex flex-col">
            {(prices.data ?? []).map((price) => (
              <li key={price.id} className="flex items-center justify-between gap-4 border-t border-line-soft py-3 first:border-t-0">
                <div className="min-w-0 text-sm">
                  <p className="font-semibold">
                    Offer letter · {formatMoney({ currency: price.currency, amountMinor: price.amount_minor })} {price.purpose === "charge" ? "charged" : "shown"}
                  </p>
                  <p className="text-ink-2">{price.purpose === "display" ? "Shown on the website and at checkout" : "Amount sent to PayU"}</p>
                </div>
                <Pill tone={price.active ? "success" : "outline"}>{price.active ? "Active" : "Inactive"}</Pill>
              </li>
            ))}
          </ul>
        </AdminCard>
      </div>
    </>
  );
}

const REPORT_LABEL = { new: "New", investigating: "Investigating", closed: "Closed" } as const;
