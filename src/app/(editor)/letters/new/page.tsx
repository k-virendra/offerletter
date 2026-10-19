import type { Metadata } from "next";
import { NewLetterForm } from "@/components/editor/new-letter-form";
import { getProfile, requireUser } from "@/lib/auth";
import { listCompanies } from "@/lib/companies/queries";
import { countryOptions } from "@/lib/countries";
import { companyLetterPlace, listJurisdictions, loadLetterContext } from "@/lib/letter/context.server";
import { letterCompany } from "@/lib/letter/letters.server";

export const metadata: Metadata = { title: "New letter" };

export default async function NewLetterPage({ searchParams }: PageProps<"/letters/new">) {
  await requireUser("/letters/new");
  const [params, profile, list, jurisdictions] = await Promise.all([searchParams, getProfile(), listCompanies(), listJurisdictions()]);

  const usable = list.companies.filter((company) => !company.archived_at && !company.suspended_at);
  const companies = await Promise.all(
    usable.map(async (company) => ({
      summary: { id: company.id, name: company.legal_name, countryCode: company.country_code, regionCode: company.region_code, paid: company.paid, drafts: company.drafts },
      letterCompany: await letterCompany(company, 60 * 60),
      place: await companyLetterPlace(company),
    })),
  );

  // Style thumbnails show real letter pages: one A4 and one US Letter sample country.
  const available = jurisdictions.filter((j) => !j.unavailable && j.selectable);
  const sampleCodes = { a4: available.find((j) => j.paperSize === "a4")?.code, letter: available.find((j) => j.paperSize === "letter")?.code };
  const [a4, letter] = await Promise.all([
    sampleCodes.a4 ? loadLetterContext(sampleCodes.a4) : null,
    sampleCodes.letter ? loadLetterContext(sampleCodes.letter) : null,
  ]);

  const requested = typeof params.company === "string" ? params.company : undefined;
  const limit = profile?.company_limit ?? 5;

  return (
    <NewLetterForm
      companies={companies}
      initialCompanyId={companies.some((c) => c.summary.id === requested) ? requested : companies[0]?.summary.id}
      hasArchivedOnly={!companies.length && list.companies.length > 0}
      placesLeft={Math.max(0, limit - list.companies.length)}
      limit={limit}
      addingCompany={params["add-company"] === "1"}
      sampleContexts={{ a4, letter }}
      countries={countryOptions()}
    />
  );
}
