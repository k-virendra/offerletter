import type { Metadata } from "next";
import Link from "next/link";
import { setCountryEnabled } from "@/app/admin/actions";
import { ToggleAction } from "@/components/admin/controls";
import { CountryStatus } from "@/components/admin/country-status";
import { CountryNotesForm } from "@/components/admin/forms";
import { AdminCard, AdminHeader, Pill } from "@/components/admin/ui";
import { countryReadiness } from "@/lib/admin/queries.server";

export const metadata: Metadata = { title: "Countries" };

export default async function AdminCountriesPage() {
  const countries = await countryReadiness();
  return (
    <>
      <AdminHeader
        title="Countries"
        description="A country can be switched on only when every section it requires has an approved clause, in the country itself or a parent (New York inherits the US)."
      />
      <AdminCard>
        <ul className="flex flex-col">
          {countries.map((country) => (
            <li key={country.code} className="border-t border-line-soft py-4 first:border-t-0 first:pt-0 last:pb-0">
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0 text-sm">
                  <p className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-base font-semibold">{country.label}</span>
                    <span className="text-ink-2">
                      {country.code} · {country.currency} · {country.paperSize === "a4" ? "A4" : "Letter"}
                    </span>
                    {!country.selectable ? <Pill tone="neutral">Group only</Pill> : null}
                  </p>
                  {country.selectable ? (
                    <CountryStatus missing={country.missing} required={country.required} inherited={country.inherited} />
                  ) : (
                    <p className="mt-0.5 text-[13px] text-ink-2">People don’t pick it on its own: it holds wording its states or provinces share.</p>
                  )}
                  {country.missing.length ? (
                    <Link href={`/admin/clauses?country=${country.code}&status=all`} className="mt-1 inline-block text-[13px] font-semibold text-evergreen-700 underline underline-offset-2">
                      Open its clauses
                    </Link>
                  ) : null}
                </div>
                <ToggleAction checked={country.enabled} label={`${country.label}: letters ${country.enabled ? "on" : "off"}`} action={setCountryEnabled.bind(null, country.code)} />
              </div>
              <details className="mt-2 text-sm">
                <summary className="inline-flex min-h-11 cursor-pointer items-center font-semibold text-evergreen-700">
                  Notes{country.publicNote ? ` · “${country.publicNote}”` : ""}
                </summary>
                <div className="mt-2 max-w-[640px]">
                  <CountryNotesForm code={country.code} publicNote={country.publicNote ?? ""} adminNotes={country.adminNotes ?? ""} />
                </div>
              </details>
            </li>
          ))}
        </ul>
      </AdminCard>
    </>
  );
}
