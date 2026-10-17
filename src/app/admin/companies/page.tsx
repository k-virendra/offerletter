import { Ban, Flag } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { CompanyLimitForm, SuspendForm } from "@/components/admin/forms";
import { SearchBox } from "@/components/admin/search-box";
import { AdminCard, AdminHeader, AdminTable, EmptyState, Pill, td, th } from "@/components/admin/ui";
import { shortDateTime } from "@/lib/admin/queries.server";
import { countryName } from "@/lib/countries";
import { createClient } from "@/lib/supabase/server";
import { formatDay } from "@/lib/template/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Companies" };

const COLUMNS = "id, legal_name, country_code, registration_number, owner_id, archived_at, suspended_at, suspended_reason, created_at, profiles(email, company_limit)";

/** Letters, digits, spaces and . @ - only: the query goes into a PostgREST filter. */
const cleanQuery = (value: unknown) => (typeof value === "string" ? value.replace(/[^\p{L}\p{N}@.\- ]/gu, "").trim().slice(0, 80) : "");

export default async function AdminCompaniesPage({ searchParams }: PageProps<"/admin/companies">) {
  const params = await searchParams;
  const q = cleanQuery(params.q);
  const selectedId = typeof params.id === "string" && z.uuid().safeParse(params.id).success ? params.id : null;
  const supabase = await createClient();

  let query = supabase.from("companies").select(COLUMNS).order("created_at", { ascending: false }).limit(50);
  if (q) {
    const { data: owners } = await supabase.from("profiles").select("id").ilike("email", `%${q}%`).limit(50);
    const ownerFilter = owners?.length ? `,owner_id.in.(${owners.map((o) => o.id).join(",")})` : "";
    query = query.or(`legal_name.ilike.%${q}%,registration_number.ilike.%${q}%${ownerFilter}`);
  }
  const { data: companies } = await query;
  const ids = (companies ?? []).map((c) => c.id);
  const [{ data: counts }, { data: openReports }] = await Promise.all([
    ids.length ? supabase.from("company_letter_counts").select("company_id, paid, drafts").in("company_id", ids) : Promise.resolve({ data: [] }),
    ids.length ? supabase.from("abuse_reports").select("company_id").in("company_id", ids).neq("status", "closed") : Promise.resolve({ data: [] }),
  ]);
  const letterCount = (id: string) => counts?.find((c) => c.company_id === id);
  const reportCount = (id: string) => (openReports ?? []).filter((r) => r.company_id === id).length;

  return (
    <>
      <AdminHeader
        title="Companies"
        actions={<SearchBox path="/admin/companies" value={q} label="Search companies" placeholder="Company, owner email or registration no." />}
      />
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <AdminCard>
          {companies?.length ? (
            <AdminTable caption="Companies" minWidth={640}>
              <thead>
                <tr>
                  <th className={th}>Company</th>
                  <th className={th}>Owner</th>
                  <th className={th}>Letters</th>
                  <th className={th}>Status</th>
                </tr>
              </thead>
              <tbody>
                {companies.map((company) => {
                  const letters = letterCount(company.id);
                  const reports = reportCount(company.id);
                  return (
                    <tr key={company.id} className={cn(company.id === selectedId && "bg-hover-soft")}>
                      <td className={td}>
                        <Link
                          href={`/admin/companies?${new URLSearchParams({ ...(q ? { q } : {}), id: company.id })}`}
                          aria-current={company.id === selectedId ? "true" : undefined}
                          className="font-semibold text-ink underline-offset-2 hover:underline"
                        >
                          {company.legal_name}
                        </Link>
                        <p className="text-[13px] text-ink-2">
                          {countryName(company.country_code)} · {company.registration_number}
                        </p>
                      </td>
                      <td className={`${td} break-all`}>{company.profiles?.email}</td>
                      <td className={td}>{[letters?.paid ? `${letters.paid} paid` : "", letters?.drafts ? `${letters.drafts} drafts` : ""].filter(Boolean).join(" · ") || "None"}</td>
                      <td className={td}>
                        {company.suspended_at ? (
                          <Pill tone="danger">
                            <Ban aria-hidden className="size-3.5" />
                            Suspended
                          </Pill>
                        ) : reports ? (
                          <Pill tone="danger">
                            <Flag aria-hidden className="size-3.5" />
                            {reports} {reports === 1 ? "report" : "reports"}
                          </Pill>
                        ) : company.archived_at ? (
                          <Pill tone="neutral">Archived</Pill>
                        ) : (
                          <Pill tone="success">Active</Pill>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </AdminTable>
          ) : (
            <EmptyState>{q ? `No company matches “${q}”.` : "No companies yet."}</EmptyState>
          )}
        </AdminCard>
        {selectedId ? <CompanyDetail id={selectedId} /> : <EmptyState>Select a company to see its owner, limit, reports and history.</EmptyState>}
      </div>
    </>
  );
}

async function CompanyDetail({ id }: { id: string }) {
  const supabase = await createClient();
  const { data: company } = await supabase.from("companies").select(COLUMNS).eq("id", id).maybeSingle();
  if (!company) return <EmptyState>This company no longer exists.</EmptyState>;
  const [{ count: places }, { data: reports }, { data: audit }, { data: payments }] = await Promise.all([
    supabase.from("companies").select("id", { count: "exact", head: true }).eq("owner_id", company.owner_id),
    supabase.from("abuse_reports").select("id, description, status, created_at").eq("company_id", id).order("created_at", { ascending: false }),
    supabase.from("audit_logs").select("id, action, details, created_at, profiles(email)").eq("entity_type", "companies").eq("entity_id", id).order("created_at", { ascending: false }).limit(20),
    supabase.from("payments").select("txnid, status, verified_at, created_at").eq("company_id", id).in("status", ["success", "refunded"]).order("created_at", { ascending: false }).limit(20),
  ]);
  const open = (reports ?? []).find((r) => r.status !== "closed");
  const limit = company.profiles?.company_limit ?? 5;

  const events = [
    ...(audit ?? []).map((entry) => ({ at: entry.created_at, text: auditText(entry.action, entry.details, entry.profiles?.email) })),
    ...(reports ?? []).map((report) => ({ at: report.created_at, text: "misuse report received" })),
    ...(payments ?? []).map((payment) => ({ at: payment.verified_at ?? payment.created_at, text: `letter paid (${payment.txnid})${payment.status === "refunded" ? ", refunded" : ""}` })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  return (
    <AdminCard className="flex flex-col gap-5 max-xl:order-first">
      <div>
        <h2 className="text-xl font-semibold">{company.legal_name}</h2>
        <p className="text-sm text-ink-2">
          {countryName(company.country_code)} · {company.registration_number} · added {formatDay(company.created_at)}
        </p>
      </div>
      {open ? (
        <Link href={`/admin/reports?id=${open.id}`} className="flex items-start gap-2.5 rounded-xl bg-danger-50 px-4 py-3 text-sm text-danger-700 no-underline">
          <Flag aria-hidden className="mt-0.5 size-4 shrink-0" />
          <span>
            <strong className="font-semibold">Open report:</strong> <span className="line-clamp-2">{open.description}</span>
          </span>
        </Link>
      ) : null}
      <div className="text-sm">
        <h3 className="font-semibold">Owner</h3>
        <p className="break-all">
          {company.profiles?.email} · uses {places ?? 0} of {limit} company places
        </p>
      </div>
      <CompanyLimitForm key={`${company.owner_id}:${limit}`} ownerId={company.owner_id} limit={limit} />
      <SuspendForm companyId={company.id} suspended={Boolean(company.suspended_at)} reason={company.suspended_reason} />
      <div>
        <h3 className="text-sm font-semibold">History</h3>
        {events.length ? (
          <ul className="mt-1.5 list-disc pl-5 text-[13px] text-ink-2">
            {events.slice(0, 15).map((event, index) => (
              <li key={index}>
                {shortDateTime(event.at)} · {event.text}
              </li>
            ))}
          </ul>
        ) : (
          <p className="mt-1 text-[13px] text-ink-2">Nothing yet.</p>
        )}
      </div>
    </AdminCard>
  );
}

function auditText(action: string, details: unknown, email: string | null | undefined): string {
  const changed = ((details as { changed?: string[] } | null)?.changed ?? []).filter((key) => key !== "updated_at");
  const who = email ? ` by ${email}` : "";
  if (action === "insert") return `company created${who || " by owner"}`;
  if (action === "delete") return `company deleted${who}`;
  if (changed.includes("suspended_at")) return `suspended or reinstated${who}`;
  if (changed.includes("archived_at")) return `archived or restored${who}`;
  return `details changed (${changed.join(", ") || "no fields"})${who}`;
}
