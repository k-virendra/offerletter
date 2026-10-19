import { Archive, ShieldAlert } from "lucide-react";
import Link from "next/link";
import { CompanyMenu, RestoreButton, type CompanyActionTarget } from "@/components/companies/company-actions";
import { Button } from "@/components/ui/button";
import { readableAccent } from "@/lib/color";
import { companyInitials, letterSummary, letterSummaryShort } from "@/lib/companies/format";
import type { CompanySummary } from "@/lib/companies/queries";
import { placeName } from "@/lib/countries";
import { cn } from "@/lib/utils";

export function CompanyLogoTile({ company, className }: { company: CompanySummary; className?: string }) {
  const accent = company.brand_color ? readableAccent(company.brand_color).hex : "#3D4451";
  // Most logos are wide; a square tile would shrink them to an unreadable strip.
  const wide = Boolean(company.logoUrl && company.logo_width && company.logo_height && company.logo_width / company.logo_height > 1.4);
  return (
    <span
      aria-hidden
      className={cn(
        "inline-flex size-14 shrink-0 items-center justify-center overflow-hidden rounded-xl border border-line bg-white",
        className,
        wide && "w-28 max-sm:h-12 max-sm:w-24",
      )}
    >
      {company.logoUrl ? (
        // A short-lived signed URL from private storage.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={company.logoUrl} alt="" className="max-h-full max-w-full object-contain p-1" />
      ) : (
        <span className="font-serif text-lg font-semibold tracking-[0.08em]" style={{ color: company.archived_at ? "#5B6472" : accent }}>
          {companyInitials(company.legal_name)}
        </span>
      )}
    </span>
  );
}

export function StatusBadge({ kind }: { kind: "archived" | "suspended" }) {
  return kind === "archived" ? (
    <span className="inline-flex h-6 items-center gap-1 rounded-full bg-neutral-chip px-2 text-xs font-semibold text-ink-2">
      <Archive aria-hidden className="size-3" strokeWidth={2.2} />
      Archived
    </span>
  ) : (
    <span className="inline-flex h-6 items-center gap-1 rounded-full bg-danger-50 px-2 text-xs font-semibold text-danger-700">
      <ShieldAlert aria-hidden className="size-3" strokeWidth={2.2} />
      Suspended
    </span>
  );
}

export function CompanyCard({ company, limit }: { company: CompanySummary; limit: number }) {
  const archived = Boolean(company.archived_at);
  const suspended = Boolean(company.suspended_at);
  const target: CompanyActionTarget = {
    id: company.id,
    name: company.legal_name,
    paid: company.paid,
    drafts: company.drafts,
    archived,
    suspended,
    limit,
  };
  const accent = company.brand_color ? readableAccent(company.brand_color) : null;
  const country = placeName(company.country_code, company.region_code);

  return (
    <li
      aria-labelledby={`company-${company.id}-name`}
      className={cn(
        "flex flex-col gap-4 rounded-[14px] border border-line p-5 max-sm:gap-3 max-sm:p-4",
        archived ? "bg-[#FBFBF9]" : "bg-white shadow-card",
      )}
    >
      <div className="flex items-start gap-3.5">
        <CompanyLogoTile company={company} className={cn(archived && "bg-white", "max-sm:size-12")} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 id={`company-${company.id}-name`} className={cn("text-lg font-semibold", archived && "text-ink-2")}>
              <Link href={`/companies?edit=${company.id}`} scroll={false} className="text-inherit no-underline hover:underline">
                {company.legal_name}
              </Link>
            </h2>
            {archived ? <StatusBadge kind="archived" /> : null}
            {suspended ? <StatusBadge kind="suspended" /> : null}
          </div>
          <p className="mt-0.5 text-sm text-muted max-sm:hidden">
            {country} · {company.registration_number}
          </p>
          <p className="mt-0.5 text-sm text-muted sm:hidden">
            {country} · {letterSummaryShort(company.paid, company.drafts)}
          </p>
        </div>
        <CompanyMenu company={target} />
      </div>

      {suspended ? (
        <p className="rounded-lg bg-danger-50 px-3 py-2.5 text-sm text-danger-700">
          New letters and payments for this company are paused while we look into a report. Letters you’ve already issued
          can still be downloaded. <Link href="/contact?topic=suspension" className="text-danger-700">Contact support</Link>
        </p>
      ) : null}

      {archived ? (
        <>
          <p className="text-sm text-ink-2 max-sm:hidden">
            {company.paid ? `${company.paid} paid ${company.paid === 1 ? "letter stays" : "letters stay"} available to download. ` : ""}
            Archived companies can’t be used for new letters and still use a place.
          </p>
          <div className="flex gap-2 max-sm:hidden">
            <RestoreButton company={target} />
          </div>
        </>
      ) : (
        <>
          <dl className="grid grid-cols-3 gap-3 text-sm max-sm:hidden">
            <div>
              <dt className="text-xs text-muted">Signatory</dt>
              <dd className="mt-0.5">{company.signatory_name}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Letters</dt>
              <dd className="mt-0.5">{letterSummary(company.paid, company.drafts)}</dd>
            </div>
            <div>
              <dt className="text-xs text-muted">Brand colour</dt>
              <dd className="mt-0.5 flex flex-wrap items-center gap-1.5">
                {company.brand_color && accent ? (
                  <>
                    <span aria-hidden className="size-4 rounded" style={{ background: company.brand_color }} />
                    {company.brand_color}
                    {accent.darkened ? <span className="text-xs text-marigold-700">· darkened for text</span> : null}
                  </>
                ) : (
                  <span className="text-muted">Style default</span>
                )}
              </dd>
            </div>
          </dl>
          <div className="flex flex-wrap gap-2 max-sm:hidden">
            {!suspended ? (
              <Button asChild variant="secondary">
                <Link href={`/letters/new?company=${company.id}`} className="no-underline">
                  New letter
                </Link>
              </Button>
            ) : null}
            <Button asChild variant="ghost" className="text-evergreen-600">
              <Link href={`/companies?edit=${company.id}`} scroll={false} className="no-underline" aria-label={`Edit ${company.legal_name}`}>
                Edit
              </Link>
            </Button>
          </div>
        </>
      )}
    </li>
  );
}
