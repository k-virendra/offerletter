import { Lock } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { z } from "zod";
import { ClauseEditor, type ClauseHistoryEntry } from "@/components/admin/clause-editor";
import { ClauseFilters, NewClauseButton } from "@/components/admin/clause-filters";
import { AdminCard, AdminHeader, EmptyState, Pill, REVIEW_LABELS } from "@/components/admin/ui";
import { countryReadiness, shortDateTime } from "@/lib/admin/queries.server";
import { loadAdminPreviewContext } from "@/lib/letter/context.server";
import { sampleValues } from "@/lib/letter/samples";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import { formatDay } from "@/lib/template/format";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "Clause library" };

type Status = keyof typeof REVIEW_LABELS;

export default async function AdminClausesPage({ searchParams }: PageProps<"/admin/clauses">) {
  const params = await searchParams;
  const supabase = await createClient();
  const countries = await countryReadiness();
  const country = countries.find((c) => c.code === params.country) ?? countries.find((c) => c.missing.length && c.selectable) ?? countries[0];
  const status = (["draft", "in_review", "approved"] as const).find((s) => s === params.status) ?? "all";
  const selectedId = typeof params.id === "string" && z.uuid().safeParse(params.id).success ? params.id : null;
  if (!country) return <EmptyState>No countries yet. Run the seed first.</EmptyState>;

  const [{ data: sections }, { data: rows }] = await Promise.all([
    supabase.from("sections").select("key, default_title, default_order, always_included").order("default_order"),
    supabase.from("clause_variants").select("id, section_key, title, version, review_status, locked").eq("jurisdiction_code", country.code).eq("language", "en").order("version", { ascending: false }),
  ]);
  // One row per section: its latest version in this country.
  const latest = new Map<string, NonNullable<typeof rows>[number]>();
  for (const row of rows ?? []) if (!latest.has(row.section_key)) latest.set(row.section_key, row);
  const sectionTitle = (key: string) => sections?.find((s) => s.key === key)?.default_title ?? key;
  const list = [...latest.values()]
    .filter((row) => status === "all" || row.review_status === status)
    .sort((a, b) => (sections?.findIndex((s) => s.key === a.section_key) ?? 0) - (sections?.findIndex((s) => s.key === b.section_key) ?? 0));
  const unwritten = (sections ?? []).filter((s) => !latest.has(s.key));
  const selected = (rows ?? []).find((row) => row.id === selectedId) ?? (selectedId ? null : list[0]);
  const href = (extra: Record<string, string>) => `/admin/clauses?${new URLSearchParams({ country: country.code, status, ...extra })}`;

  return (
    <>
      <AdminHeader
        title="Clause library"
        description="Every clause starts as a draft. A country can go live only when all its required sections have an approved clause."
        actions={<NewClauseButton country={country.code} sections={unwritten.map((s) => ({ key: s.key, title: s.default_title }))} />}
      />
      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
        <AdminCard className="p-0 md:p-0">
          <div className="border-b border-line-soft p-4">
            <ClauseFilters countries={countries.map((c) => ({ code: c.code, label: `${c.label} (${c.code})` }))} country={country.code} status={status} />
          </div>
          {list.length ? (
            <ul className="flex flex-col gap-1 p-2">
              {list.map((row) => (
                <li key={row.id}>
                  <Link
                    href={href({ id: row.id })}
                    aria-current={row.id === selected?.id ? "true" : undefined}
                    className={cn("flex flex-col gap-1 rounded-xl px-3 py-2.5 no-underline", row.id === selected?.id ? "bg-evergreen-50" : "hover:bg-ghost-hover")}
                  >
                    <span className="flex items-center gap-1.5 text-[15px] font-semibold text-ink">
                      {row.locked ? <Lock aria-label="Required" className="size-3.5 shrink-0" /> : null}
                      {row.title || sectionTitle(row.section_key)}
                    </span>
                    <span className="flex items-center gap-2 text-[13px] text-ink-2">
                      {country.code} · v{row.version}
                      <Pill tone={REVIEW_LABELS[row.review_status as Status].tone} className="h-5 px-2 text-xs">
                        {REVIEW_LABELS[row.review_status as Status].text}
                      </Pill>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="p-4 text-sm text-ink-2">{status === "all" ? "No clauses are written for this country itself yet." : "No clauses with this status."}</p>
          )}
          {unwritten.length && status === "all" ? (
            <p className="border-t border-line-soft p-4 text-[13px] text-ink-2">
              Not written for {country.code} ({unwritten.length}): {unwritten.map((s) => s.default_title).join(", ")}.{" "}
              {country.parentCode ? `These use ${country.parentCode}’s wording, if it has any.` : ""}
            </p>
          ) : null}
        </AdminCard>
        {selected ? <ClauseDetail id={selected.id} countryLabel={country.label} /> : <EmptyState>Select a clause to read, edit or review it.</EmptyState>}
      </div>
    </>
  );
}

async function ClauseDetail({ id, countryLabel }: { id: string; countryLabel: string }) {
  // With the secret key: legal notes are for admins and aren't readable through any user session.
  const db = adminClient();
  const { data: clause } = await db
    .from("clause_variants")
    .select("id, section_key, jurisdiction_code, title, body, locked, locked_reason, editor_help, legal_notes, version, review_status, reviewer, reviewed_at, source_file, created_at, profiles(email)")
    .eq("id", id)
    .maybeSingle();
  if (!clause) return <EmptyState>This clause no longer exists.</EmptyState>;

  const [{ data: versions }, { data: fields }, { data: chain }, context, { data: section }] = await Promise.all([
    db
      .from("clause_variants")
      .select("id, version, review_status, reviewer, reviewed_at, source_file, created_at, profiles(email)")
      .eq("section_key", clause.section_key)
      .eq("jurisdiction_code", clause.jurisdiction_code)
      .eq("language", "en")
      .order("version", { ascending: false }),
    db.from("field_definitions").select("key, section_key, jurisdictions"),
    db.rpc("jurisdiction_chain", { p_code: clause.jurisdiction_code }),
    loadAdminPreviewContext(clause.jurisdiction_code),
    db.from("sections").select("default_title").eq("key", clause.section_key).maybeSingle(),
  ]);
  const ids = (versions ?? []).map((v) => v.id);
  const { data: audit } = ids.length
    ? await db.from("audit_logs").select("entity_id, action, details, created_at, profiles(email)").eq("entity_type", "clause_variants").in("entity_id", ids).order("created_at", { ascending: false }).limit(40)
    : { data: [] };

  const history: ClauseHistoryEntry[] = (versions ?? []).map((v) => ({
    id: v.id,
    version: v.version,
    status: v.review_status,
    lines: [
      v.source_file ? `seeded from content/${v.source_file} · ${formatDay(v.created_at)}` : `created${v.profiles?.email ? ` by ${v.profiles.email}` : ""} · ${formatDay(v.created_at)}`,
      ...(audit ?? [])
        .filter((entry) => entry.entity_id === v.id && entry.action === "update")
        .map((entry) => `${describeChange((entry.details as { changed?: string[]; status?: string } | null) ?? {})}${entry.profiles?.email ? ` by ${entry.profiles.email}` : ""} · ${shortDateTime(entry.created_at)}`),
      ...(v.review_status === "approved" && v.reviewer ? [`approved · reviewed by ${v.reviewer}${v.reviewed_at ? ` on ${formatDay(v.reviewed_at)}` : ""}`] : []),
    ],
  }));

  return (
    <ClauseEditor
      key={`${clause.id}:${clause.review_status}`}
      clause={{
        id: clause.id,
        sectionKey: clause.section_key,
        sectionTitle: section?.default_title ?? clause.section_key,
        jurisdictionCode: clause.jurisdiction_code,
        jurisdictionLabel: countryLabel,
        version: clause.version,
        status: clause.review_status,
        title: clause.title ?? "",
        body: clause.body,
        locked: clause.locked,
        lockedReason: clause.locked_reason ?? "",
        editorHelp: clause.editor_help ?? "",
        legalNotes: clause.legal_notes ?? "",
        reviewer: clause.reviewer ?? "",
        reviewedAt: clause.reviewed_at,
      }}
      isLatest={(versions?.[0]?.id ?? clause.id) === clause.id}
      fields={(fields ?? []).map((f) => ({ key: f.key, sectionKey: f.section_key, jurisdictions: f.jurisdictions }))}
      chain={chain ?? [clause.jurisdiction_code]}
      context={context}
      sampleValues={sampleValues(clause.jurisdiction_code)}
      history={history}
    />
  );
}

function describeChange({ changed = [], status }: { changed?: string[]; status?: string }): string {
  if (changed.includes("review_status")) return status === "in_review" ? "sent for review" : status === "approved" ? "approved" : "sent back to draft";
  const words: Record<string, string> = { body: "text", title: "title", locked: "required setting", locked_reason: "reason", legal_notes: "legal notes", editor_help: "help text" };
  const named = changed.map((key) => words[key]).filter(Boolean);
  return named.length ? `edited (${named.join(", ")})` : "edited";
}
