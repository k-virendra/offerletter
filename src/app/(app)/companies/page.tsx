import { Building2, Plus } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { DeleteButton, RestoreButton, type CompanyActionTarget } from "@/components/companies/company-actions";
import { CompanyCard, StatusBadge } from "@/components/companies/company-card";
import { CompanyDrawer } from "@/components/companies/company-drawer";
import { Button } from "@/components/ui/button";
import { getProfile, requireUser } from "@/lib/auth";
import { letterSummary, placesLeft } from "@/lib/companies/format";
import { listCompanies, type CompanySummary } from "@/lib/companies/queries";
import { countryName, countryOptions } from "@/lib/countries";
import { cn } from "@/lib/utils";

export const metadata: Metadata = { title: "My companies" };

const LIMIT_HELP_URL = "/contact?topic=company-limit";

export default async function CompaniesPage({ searchParams }: PageProps<"/companies">) {
  await requireUser("/companies");
  const [params, profile, list] = await Promise.all([searchParams, getProfile(), listCompanies()]);
  const limit = profile?.company_limit ?? 5;
  const companies = list.companies;
  const used = companies.length;
  const atLimit = used >= limit;

  const editing = typeof params.edit === "string" ? companies.find((company) => company.id === params.edit) : undefined;
  const adding = params.add === "1" && !atLimit && !list.error;
  // A drawer URL that no longer applies (the limit was reached, the company was deleted) must not linger: once a
  // place frees up, the add drawer would otherwise pop open by itself.
  if ((params.add !== undefined && !adding) || (params.edit !== undefined && !editing && !list.error)) redirect("/companies");

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-medium tracking-tight">My companies</h1>
          <p className="mt-1.5 max-w-[640px] text-[15px] text-ink-2">
            {atLimit && used > 0
              ? `All ${limit} company places are used.`
              : "Entered once, filled in on every letter. Edits apply to new letters; letters you’ve already issued keep the details they were issued with."}
          </p>
        </div>
        {atLimit ? (
          <Button aria-disabled="true" aria-describedby="limit-message" className="bg-[#D5D8D2] text-[#4E5561] hover:bg-[#D5D8D2]">
            <Plus aria-hidden strokeWidth={2.4} />
            Add company
          </Button>
        ) : (
          <Button asChild>
            <Link href="/companies?add=1" scroll={false} className="no-underline">
              <Plus aria-hidden strokeWidth={2.4} />
              Add company
            </Link>
          </Button>
        )}
      </div>

      {list.error ? (
        <section role="alert" className="flex flex-col items-center gap-2.5 rounded-2xl border border-line bg-white px-7 py-12 text-center">
          <h2 className="text-lg font-semibold">We couldn’t load your companies</h2>
          <p className="text-sm text-ink-2">Your companies are safe. Check your connection and try again.</p>
          <Button asChild variant="secondary">
            <Link href="/companies" className="no-underline">
              Try again
            </Link>
          </Button>
        </section>
      ) : used === 0 ? (
        <EmptyState limit={limit} />
      ) : atLimit ? (
        <LimitReached companies={companies} limit={limit} />
      ) : (
        <>
          <section aria-labelledby="usage-heading" className="flex flex-wrap items-center gap-x-7 gap-y-4 rounded-[14px] border border-line bg-white px-5.5 py-4.5">
            <div className="flex flex-[0_1_300px] flex-col gap-2.5">
              <h2 id="usage-heading" className="text-base font-semibold">
                {used} of {limit} company places used
              </h2>
              <UsageMeter used={used} limit={limit} />
            </div>
            <p className="flex-[1_1_360px] text-sm leading-relaxed text-ink-2">
              Archived companies still count. When all {limit} places are used, delete a company that has no paid letters to
              make room, or <Link href={LIMIT_HELP_URL}>ask us for a higher limit</Link>.
            </p>
          </section>

          <ul className="grid grid-cols-[repeat(auto-fit,minmax(min(460px,100%),1fr))] gap-4">
            {companies.map((company) => (
              <CompanyCard key={company.id} company={company} limit={limit} />
            ))}
            <li>
              <Link
                href="/companies?add=1"
                scroll={false}
                className="flex h-full min-h-40 flex-col items-center justify-center gap-2 rounded-[14px] border-2 border-dashed border-[#A3AAB2] text-evergreen-600 no-underline hover:bg-hover-soft max-sm:min-h-24"
              >
                <span aria-hidden className="inline-flex size-11 items-center justify-center rounded-xl bg-evergreen-50">
                  <Plus className="size-5" strokeWidth={2.4} />
                </span>
                <span className="text-base font-semibold">Add a company</span>
                <span className="text-sm text-ink-2">{placesLeft(used, limit)}</span>
              </Link>
            </li>
          </ul>
        </>
      )}

      {adding || editing ? (
        <CompanyDrawer
          key={editing?.id ?? "new"}
          company={editing}
          countries={countryOptions()}
          footerNote={
            editing
              ? editing.paid
                ? `Changes apply to new letters. The ${editing.paid === 1 ? "letter" : `${editing.paid} letters`} already issued keep${editing.paid === 1 ? "s" : ""} the original details.`
                : "Changes apply to new letters."
              : `This uses place ${used + 1} of ${limit}.`
          }
        />
      ) : null}
    </div>
  );
}

function UsageMeter({ used, limit }: { used: number; limit: number }) {
  const label = `${used} of ${limit} places used`;
  if (limit > 12) {
    return (
      <div role="img" aria-label={label} className="h-2.5 overflow-hidden rounded-full bg-neutral-chip">
        <div className="h-full rounded-full bg-evergreen-600" style={{ width: `${Math.min(100, (used / limit) * 100)}%` }} />
      </div>
    );
  }
  return (
    <div role="img" aria-label={label} className="flex gap-1.5">
      {Array.from({ length: limit }, (_, index) => (
        <span
          key={index}
          className={cn("h-2.5 flex-1 rounded-full", index < used ? "bg-evergreen-600" : "border-2 border-dashed border-[#858C95] bg-white")}
        />
      ))}
    </div>
  );
}

function EmptyState({ limit }: { limit: number }) {
  return (
    <section className="flex flex-col items-center gap-2.5 rounded-2xl border border-line bg-white px-7 py-14 text-center">
      <span aria-hidden className="inline-flex size-14 items-center justify-center rounded-2xl bg-evergreen-50 text-evergreen-600">
        <Building2 className="size-7" strokeWidth={1.8} />
      </span>
      <h2 className="text-lg font-semibold">Add your first company</h2>
      <p className="max-w-[380px] text-sm leading-relaxed text-ink-2">
        Enter it once, with logo, brand colour and signatory. Every letter after that starts filled in. You can save up to {limit}.
      </p>
      <Button asChild className="mt-1">
        <Link href="/companies?add=1" scroll={false} className="no-underline">
          Add company
        </Link>
      </Button>
    </section>
  );
}

function LimitReached({ companies, limit }: { companies: CompanySummary[]; limit: number }) {
  return (
    <>
      <section
        id="limit-message"
        role="status"
        aria-labelledby="limit-heading"
        className="flex flex-wrap items-center gap-x-6 gap-y-3 rounded-[14px] border-2 border-marigold-500 bg-marigold-100 px-5.5 py-4.5"
      >
        <div className="flex-[1_1_420px]">
          <h2 id="limit-heading" className="text-base font-semibold">
            You’ve reached your limit of {limit} companies
          </h2>
          <p className="mt-1 text-sm leading-relaxed text-ink-2">
            To add another, delete a company that has no paid letters. Companies with paid letters can only be archived, and
            archived companies still count. If you manage more than {limit} companies, ask us for a higher limit.
          </p>
        </div>
        <Button asChild variant="secondary">
          <Link href={LIMIT_HELP_URL} className="no-underline">
            Request a higher limit
          </Link>
        </Button>
      </section>
      <UsageMeter used={companies.length} limit={limit} />

      <div className="overflow-x-auto rounded-[14px] border border-line bg-white">
        <table className="w-full min-w-[720px] border-collapse text-sm">
          <caption className="sr-only">Your companies</caption>
          <thead>
            <tr className="text-left text-ink-2">
              {["Company", "Country", "Letters", "Can it free a place?", "Action"].map((heading) => (
                <th key={heading} scope="col" className="border-b border-line px-4 py-3 text-[13px] font-semibold first:pl-5 last:pr-5">
                  {heading}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {companies.map((company) => {
              const target: CompanyActionTarget = {
                id: company.id,
                name: company.legal_name,
                paid: company.paid,
                drafts: company.drafts,
                archived: Boolean(company.archived_at),
                suspended: Boolean(company.suspended_at),
                limit,
              };
              const deletable = company.paid === 0;
              return (
                <tr key={company.id}>
                  <th scope="row" className="border-b border-line-soft py-3 pr-4 pl-5 text-left font-semibold">
                    <span className="inline-flex flex-wrap items-center gap-2">
                      {company.legal_name}
                      {target.archived ? <StatusBadge kind="archived" /> : null}
                      {target.suspended ? <StatusBadge kind="suspended" /> : null}
                    </span>
                  </th>
                  <td className="border-b border-line-soft px-4 py-3">{countryName(company.country_code)}</td>
                  <td className="border-b border-line-soft px-4 py-3">{letterSummary(company.paid, company.drafts)}</td>
                  <td className="border-b border-line-soft px-4 py-3">
                    {deletable ? (
                      <span className="inline-flex h-6 items-center rounded-full bg-evergreen-50 px-2.5 text-[13px] font-semibold text-evergreen-700">
                        Yes, no paid letters
                      </span>
                    ) : target.archived ? (
                      "No, archived companies still count"
                    ) : (
                      "No, it has paid letters"
                    )}
                  </td>
                  <td className="border-b border-line-soft py-2 pr-5 pl-4">
                    {deletable ? (
                      <DeleteButton company={target} />
                    ) : target.archived ? (
                      <RestoreButton company={target} />
                    ) : (
                      <Button asChild variant="ghost" className="text-evergreen-600">
                        <Link href={`/companies?edit=${company.id}`} scroll={false} className="no-underline" aria-label={`Edit ${company.legal_name}`}>
                          Edit
                        </Link>
                      </Button>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-[13px] text-muted">The limit is also enforced on our servers, so it can’t be bypassed. Admins can raise it for your account.</p>
    </>
  );
}
