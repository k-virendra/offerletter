import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { ReportForm } from "@/components/admin/forms";
import { AdminCard, AdminHeader, EmptyState, Pill } from "@/components/admin/ui";
import { shortDateTime } from "@/lib/admin/queries.server";
import { createClient } from "@/lib/supabase/server";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Misuse reports" };

const STATUS = { new: { text: "New", tone: "danger" }, investigating: { text: "Investigating", tone: "warning" }, closed: { text: "Closed", tone: "neutral" } } as const;
const FILTERS = [
  { key: "open", label: "Open" },
  { key: "closed", label: "Closed" },
  { key: "all", label: "All" },
] as const;

export default async function AdminReportsPage({ searchParams }: PageProps<"/admin/reports">) {
  const params = await searchParams;
  const filter = FILTERS.find((f) => f.key === params.status)?.key ?? "open";
  const selectedId = typeof params.id === "string" && z.uuid().safeParse(params.id).success ? params.id : null;
  const supabase = await createClient();

  let query = supabase.from("abuse_reports").select("id, company_name, letter_reference, description, status, created_at").order("created_at", { ascending: false }).limit(100);
  if (filter === "open") query = query.neq("status", "closed");
  if (filter === "closed") query = query.eq("status", "closed");
  const { data: reports } = await query;

  return (
    <>
      <AdminHeader title="Misuse reports" description="Reports from candidates and companies about letters made with Offer Letter PDF, such as a company asking candidates for money." />
      <nav aria-label="Filter reports" className="mb-4 flex gap-2">
        {FILTERS.map((f) => (
          <Link
            key={f.key}
            href={`/admin/reports?status=${f.key}`}
            aria-current={f.key === filter ? "page" : undefined}
            className={cn("inline-flex min-h-11 items-center rounded-full px-4 text-sm font-semibold no-underline", f.key === filter ? "bg-ink text-white" : "bg-white text-ink-2 ring-1 ring-line hover:bg-ghost-hover")}
          >
            {f.label}
          </Link>
        ))}
      </nav>
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_460px]">
        <AdminCard>
          {reports?.length ? (
            <ul className="flex flex-col">
              {reports.map((report) => (
                <li key={report.id} className={cn("-mx-3 flex items-start gap-3 rounded-xl border-t border-line-soft px-3 py-3 first:border-t-0", report.id === selectedId && "bg-hover-soft")}>
                  <Pill tone={STATUS[report.status].tone}>{STATUS[report.status].text}</Pill>
                  <div className="min-w-0 flex-1 text-sm">
                    <Link
                      href={`/admin/reports?status=${filter}&id=${report.id}`}
                      aria-current={report.id === selectedId ? "true" : undefined}
                      className="line-clamp-2 font-semibold text-ink underline-offset-2 hover:underline"
                    >
                      {report.description}
                    </Link>
                    <p className="text-ink-2">
                      {report.company_name ? `Names “${report.company_name}” · ` : ""}reported {shortDateTime(report.created_at)}
                      {report.letter_reference ? " · reference attached" : ""}
                    </p>
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <EmptyState>{filter === "open" ? "No open reports." : "No reports here."}</EmptyState>
          )}
        </AdminCard>
        {selectedId ? <ReportDetail id={selectedId} /> : <EmptyState>Select a report to review it.</EmptyState>}
      </div>
    </>
  );
}

async function ReportDetail({ id }: { id: string }) {
  const supabase = await createClient();
  const { data: report } = await supabase
    .from("abuse_reports")
    .select("id, reporter_email, company_name, letter_reference, description, company_id, status, admin_notes, created_at, updated_at, profiles(email), companies(id, legal_name)")
    .eq("id", id)
    .maybeSingle();
  if (!report) return <EmptyState>This report no longer exists.</EmptyState>;

  // Companies whose name looks like the one reported, to link the report to.
  const name = (report.company_name ?? "").replace(/[^\p{L}\p{N} ]/gu, "").trim().split(/\s+/).slice(0, 2).join(" ");
  const { data: matches } = name.length >= 3 ? await supabase.from("companies").select("id, legal_name, profiles(email)").ilike("legal_name", `%${name}%`).limit(10) : { data: [] };
  const options = new Map((matches ?? []).map((c) => [c.id, `${c.legal_name} · ${c.profiles?.email ?? ""}`]));
  if (report.companies) options.set(report.companies.id, report.companies.legal_name);

  return (
    <AdminCard className="flex flex-col gap-4 max-xl:order-first">
      <div>
        <Pill tone={STATUS[report.status].tone}>{STATUS[report.status].text}</Pill>
        <p className="mt-2 text-[15px] whitespace-pre-line">{report.description}</p>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-sm">
        <dt className="text-muted">Reported</dt>
        <dd>{shortDateTime(report.created_at)}</dd>
        <dt className="text-muted">Company named</dt>
        <dd>{report.company_name ?? "Not given"}</dd>
        <dt className="text-muted">Letter reference</dt>
        <dd className="break-all">{report.letter_reference ?? "Not given"}</dd>
        <dt className="text-muted">Reporter</dt>
        <dd className="break-all">{report.reporter_email ?? "Anonymous"}</dd>
        {report.profiles?.email ? (
          <>
            <dt className="text-muted">Handled by</dt>
            <dd className="break-all">
              {report.profiles.email} · {shortDateTime(report.updated_at)}
            </dd>
          </>
        ) : null}
      </dl>
      {report.companies ? (
        <Link href={`/admin/companies?id=${report.companies.id}`} className="text-sm font-semibold text-evergreen-700 underline underline-offset-2">
          Open {report.companies.legal_name} (suspend, history)
        </Link>
      ) : null}
      <ReportForm
        key={`${report.id}:${report.updated_at}`}
        reportId={report.id}
        status={report.status}
        adminNotes={report.admin_notes ?? ""}
        companyId={report.company_id}
        companies={[...options].map(([value, label]) => ({ id: value, label }))}
      />
    </AdminCard>
  );
}
