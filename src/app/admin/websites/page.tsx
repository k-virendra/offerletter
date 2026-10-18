import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { SearchBox } from "@/components/admin/search-box";
import { AdminCard, AdminHeader, AdminTable, EmptyState, Pill, td, th } from "@/components/admin/ui";
import { ActivateButton, DomainStep, InvoiceActions, MailboxStep, NotesForm, OneOffInvoiceForm, StatusForm, UpdateForm, WebsiteStep } from "@/components/admin/website-forms";
import { shortDateTime } from "@/lib/admin/queries.server";
import { formatMoney } from "@/lib/payments/prices.server";
import { createClient } from "@/lib/supabase/server";
import { formatDay } from "@/lib/template/format";
import { cn } from "@/lib/utils";
import { SUBSCRIPTION_LABELS } from "@/lib/websites/queries.server";

export const metadata: Metadata = { title: "Websites" };

const FILTERS = [
  { key: "setup", label: "Needs setup", statuses: ["onboarding"] },
  { key: "active", label: "Active", statuses: ["active"] },
  { key: "past_due", label: "Past due", statuses: ["past_due"] },
  { key: "unpaid", label: "Not paid yet", statuses: ["pending_payment"] },
  { key: "closed", label: "Suspended or cancelled", statuses: ["suspended", "cancelled"] },
  { key: "all", label: "All", statuses: [] },
] as const;

const shortDay = (iso: string) => new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(iso));
const cleanQuery = (value: unknown) => (typeof value === "string" ? value.replace(/[^\p{L}\p{N}@.\- ]/gu, "").trim().slice(0, 80) : "");

export default async function AdminWebsitesPage({ searchParams }: PageProps<"/admin/websites">) {
  const params = await searchParams;
  const filter = FILTERS.find((f) => f.key === params.status) ?? FILTERS[0];
  const q = cleanQuery(params.q);
  const selectedId = typeof params.id === "string" && z.uuid().safeParse(params.id).success ? params.id : null;
  const supabase = await createClient();

  let query = supabase
    .from("subscriptions")
    .select("id, status, domain, requested_domains, created_at, paid_through, cancel_requested_at, companies(legal_name), profiles(email)")
    .order("created_at", { ascending: false })
    .limit(100);
  if (filter.statuses.length) query = query.in("status", [...filter.statuses]);
  if (q) {
    const [{ data: owners }, { data: companies }] = await Promise.all([
      supabase.from("profiles").select("id").ilike("email", `%${q}%`).limit(50),
      supabase.from("companies").select("id").ilike("legal_name", `%${q}%`).limit(50),
    ]);
    const parts = [`domain.ilike.%${q}%`];
    if (owners?.length) parts.push(`user_id.in.(${owners.map((o) => o.id).join(",")})`);
    if (companies?.length) parts.push(`company_id.in.(${companies.map((c) => c.id).join(",")})`);
    query = query.or(parts.join(","));
  }
  const { data: rows } = await query;
  const link = (extra: Record<string, string>) => `/admin/websites?${new URLSearchParams({ status: filter.key, ...(q ? { q } : {}), ...extra })}`;

  return (
    <>
      <AdminHeader
        title="Websites"
        description="Orders for business websites. Register the domain, build the site and set up the mailbox, record each step here, then activate."
        actions={<SearchBox path="/admin/websites" value={q} extra={{ status: filter.key }} label="Search websites" placeholder="Business, domain or customer email" />}
      />
      <nav aria-label="Filter websites" className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/admin/websites?${new URLSearchParams({ status: f.key, ...(q ? { q } : {}) })}`}
            aria-current={f.key === filter.key ? "page" : undefined}
            className={cn("inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold no-underline", f.key === filter.key ? "bg-ink text-white" : "bg-white text-ink-2 ring-1 ring-line hover:bg-ghost-hover")}
          >
            {f.label}
          </Link>
        ))}
      </nav>
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_520px]">
        <AdminCard>
          {rows?.length ? (
            <AdminTable caption="Website orders" minWidth={560}>
              <thead>
                <tr>
                  <th className={th}>Business</th>
                  <th className={th}>Domain</th>
                  <th className={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const label = SUBSCRIPTION_LABELS[row.status];
                  return (
                    <tr key={row.id} className={cn(row.id === selectedId && "bg-hover-soft")}>
                      <td className={td}>
                        <Link href={link({ id: row.id })} aria-current={row.id === selectedId ? "true" : undefined} className="font-semibold text-ink underline-offset-2 hover:underline">
                          {row.companies?.legal_name ?? "Deleted business"}
                        </Link>
                        <p className="text-[13px] break-all text-ink-2">{row.profiles?.email}</p>
                      </td>
                      <td className={`${td} break-all`}>{row.domain ?? `${row.requested_domains[0]} (asked)`}</td>
                      <td className={td}>
                        <Pill tone={label.tone}>{label.text}</Pill>
                        {row.cancel_requested_at && row.status !== "cancelled" ? <p className="mt-1 text-[13px] text-danger">Asked to cancel</p> : null}
                        <p className="mt-1 text-[13px] whitespace-nowrap text-muted">Ordered {shortDay(row.created_at)}</p>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </AdminTable>
          ) : (
            <EmptyState>{q ? `No website order matches “${q}”.` : "No website orders here."}</EmptyState>
          )}
        </AdminCard>
        {selectedId ? <WebsiteDetail id={selectedId} /> : <EmptyState>Select an order to set it up.</EmptyState>}
      </div>
    </>
  );
}

async function WebsiteDetail({ id }: { id: string }) {
  const supabase = await createClient();
  const { data: s } = await supabase
    .from("subscriptions")
    .select(
      "id, status, requested_domains, mailbox_name, brief, billing, contact_phone, domain, domain_expires_on, website_url, mailbox_address, mailbox_provider, domain_ready_at, website_ready_at, mailbox_ready_at, activated_at, paid_through, status_reason, cancel_requested_at, created_at, companies(id, legal_name, registered_address, contact_email, contact_phone, website), profiles(email), plans(name)",
    )
    .eq("id", id)
    .maybeSingle();
  if (!s) return <EmptyState>This order no longer exists.</EmptyState>;
  const [{ data: secret }, { data: invoices }, { data: events }] = await Promise.all([
    supabase.from("subscription_private").select("registrar, domain_cost_minor, admin_notes").eq("subscription_id", id).maybeSingle(),
    supabase.from("invoices").select("id, number, description, amount_minor, currency, due_on, status, paid_at, note").eq("subscription_id", id).order("due_on", { ascending: false }),
    supabase.from("subscription_events").select("id, kind, message, visible_to_customer, created_at, profiles(email)").eq("subscription_id", id).order("created_at", { ascending: false }).limit(40),
  ]);
  const brief = s.brief as { about?: string; pages?: string[]; references?: string };
  const billing = s.billing as { fullName?: string; email?: string };
  const label = SUBSCRIPTION_LABELS[s.status];
  const ready = Boolean(s.domain_ready_at && s.website_ready_at && s.mailbox_ready_at);

  return (
    <AdminCard className="flex flex-col gap-5 max-xl:order-first">
      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="text-xl font-semibold">{s.companies?.legal_name ?? "Deleted business"}</h2>
          <Pill tone={label.tone}>{label.text}</Pill>
        </div>
        <p className="text-sm break-all text-ink-2">
          {billing.fullName ? `${billing.fullName} · ` : ""}
          {billing.email ?? s.profiles?.email} · {s.contact_phone} · ordered {shortDateTime(s.created_at)}
        </p>
        {s.cancel_requested_at && s.status !== "cancelled" ? <p className="mt-1 text-sm font-semibold text-danger">Asked to cancel on {formatDay(s.cancel_requested_at)}</p> : null}
        {s.status_reason ? <p className="mt-1 text-sm text-ink-2">Reason: {s.status_reason}</p> : null}
      </div>

      <section>
        <h3 className="text-sm font-semibold">What they asked for</h3>
        <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
          <dt className="text-muted">Domains</dt>
          <dd className="break-all">{s.requested_domains.join(", ")}</dd>
          <dt className="text-muted">Mailbox</dt>
          <dd className="break-all">
            {s.mailbox_name}@{s.domain ?? s.requested_domains[0]}
          </dd>
          <dt className="text-muted">Pages</dt>
          <dd>{brief.pages?.join(", ") || "–"}</dd>
          <dt className="text-muted">About</dt>
          <dd className="whitespace-pre-line">{brief.about}</dd>
          {brief.references ? (
            <>
              <dt className="text-muted">Notes</dt>
              <dd className="whitespace-pre-line">{brief.references}</dd>
            </>
          ) : null}
          <dt className="text-muted">Business</dt>
          <dd className="whitespace-pre-line">
            {[s.companies?.registered_address, s.companies?.contact_email, s.companies?.contact_phone, s.companies?.website].filter(Boolean).join("\n")}
          </dd>
        </dl>
      </section>

      {s.status !== "pending_payment" && s.status !== "cancelled" ? (
        <section className="flex flex-col gap-3">
          <h3 className="text-sm font-semibold">Setup</h3>
          <DomainStep
            id={s.id}
            done={Boolean(s.domain_ready_at)}
            defaults={{
              domain: s.domain ?? s.requested_domains[0] ?? "",
              registrar: secret?.registrar ?? "",
              cost: secret?.domain_cost_minor != null ? String(secret.domain_cost_minor / 100) : "",
              expiresOn: s.domain_expires_on ?? "",
            }}
          />
          <WebsiteStep id={s.id} done={Boolean(s.website_ready_at)} url={s.website_url ?? ""} />
          <MailboxStep
            id={s.id}
            done={Boolean(s.mailbox_ready_at)}
            defaults={{ address: s.mailbox_address ?? `${s.mailbox_name}@${s.domain ?? s.requested_domains[0] ?? ""}`, provider: s.mailbox_provider ?? "" }}
          />
          {s.activated_at ? <p className="text-sm text-evergreen-700">Active since {formatDay(s.activated_at)}.</p> : <ActivateButton id={s.id} ready={ready} />}
        </section>
      ) : s.status === "pending_payment" ? (
        <p className="rounded-lg bg-canvas px-3.5 py-2.5 text-sm text-ink-2">Not paid yet: setup starts once the onboarding invoice is paid.</p>
      ) : null}

      <section className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">Invoices{s.paid_through ? ` · paid until ${formatDay(s.paid_through)}` : ""}</h3>
        <ul className="flex flex-col">
          {(invoices ?? []).map((invoice) => (
            <li key={invoice.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line-soft py-2.5 text-sm first:border-t-0">
              <span className="min-w-0">
                <span className="block">{invoice.description}</span>
                <span className="block text-[13px] text-muted">
                  {invoice.number} · {invoice.status === "paid" && invoice.paid_at ? `paid ${formatDay(invoice.paid_at)}` : invoice.status === "void" ? "cancelled" : `due ${formatDay(invoice.due_on)}`}
                  {invoice.note ? ` · ${invoice.note}` : ""}
                </span>
              </span>
              <span className="flex items-center gap-2">
                <span className="tabular-nums">{formatMoney({ currency: invoice.currency, amountMinor: invoice.amount_minor })}</span>
                {invoice.status === "open" ? <InvoiceActions invoiceId={invoice.id} label={invoice.number} /> : <Pill tone={invoice.status === "paid" ? "success" : "neutral"}>{invoice.status === "paid" ? "Paid" : "Cancelled"}</Pill>}
              </span>
            </li>
          ))}
        </ul>
        {s.status !== "cancelled" ? <OneOffInvoiceForm id={s.id} /> : null}
      </section>

      <section className="flex flex-col gap-3">
        <h3 className="text-sm font-semibold">Updates</h3>
        <UpdateForm id={s.id} />
        <ol className="flex flex-col">
          {(events ?? []).map((event) => (
            <li key={event.id} className="border-t border-line-soft py-2 text-sm first:border-t-0">
              <p className="whitespace-pre-line">{event.message}</p>
              <p className="text-[13px] text-muted">
                {shortDateTime(event.created_at)}
                {event.profiles?.email ? ` · ${event.profiles.email}` : ""}
                {event.visible_to_customer ? "" : " · internal"}
              </p>
            </li>
          ))}
        </ol>
      </section>

      <NotesForm id={s.id} notes={secret?.admin_notes ?? ""} />

      <section className="flex flex-col gap-2 rounded-xl border border-danger/40 p-4">
        <h3 className="font-semibold text-danger-700">Status</h3>
        <StatusForm id={s.id} status={s.status} />
      </section>
    </AdminCard>
  );
}
