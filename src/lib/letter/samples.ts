import type { LetterCompany, LetterState } from "./types";

// The fictional sample letter from the design canvas, for tests and screenshots.

export const EXAMPLE_ENGINEERING: LetterCompany = {
  id: "company-ee",
  legalName: "Example Engineering GmbH",
  tradingName: null,
  registeredAddress: "Beispielstraße 10, 80331 München, Germany",
  registrationNumber: "HRB 000000",
  countryName: "Germany",
  website: "https://example-engineering.test",
  contactPhone: "+49 89 0000 0000",
  contactEmail: "people@example-engineering.test",
  brandColor: "#1F4E8C",
  logo: null,
};

export const LENA_VALUES: LetterState["values"] = {
  "candidate.full_name": "Lena Hoffmann",
  "candidate.greeting_name": "Lena",
  "candidate.address": "Beispielweg 4\n80333 München",
  "position.job_title": "Senior Backend Engineer",
  "position.department": "Platform",
  "position.reports_to": "Jonas Becker, Engineering Manager",
  "position.start_date": "2026-12-01",
  "position.contract_type": "permanent",
  "workplace.location": "our Munich office, with up to two days of remote work a week",
  "workplace.hours_per_week": "40",
  "pay.base_amount": "78000",
  "pay.period": "year",
  "pay.frequency": "monthly",
  "bonus.terms": "up to 10% of your annual gross salary, based on targets agreed each year",
  "probation.months": "6",
  "leave.days": "28",
  "notice.option": "statutory",
  "benefits.description": "a monthly public transport allowance, a company pension contribution and a learning budget of €1,000 a year",
  "relocation.description": "a one-off relocation allowance of €3,000 gross",
  "conditions.right_to_work": true,
  "conditions.references": true,
  "acceptance.reply_by": "2026-10-30",
  "acceptance.place": "Munich",
  "signatory.name": "Dr. Anna Weber",
  "signatory.title": "Head of People",
};

/** Complete, valid answers for a sample letter in any launch jurisdiction (country choices differ). */
export function sampleValues(code: string): LetterState["values"] {
  const country = code.split("-")[0]!;
  const byCountry: Record<string, LetterState["values"]> = {
    DE: { "info.third_country_national": true, "pension.terms": "The company adds 20% to the amount you convert." },
    IE: { "pension.terms": "You can join the company pension scheme after three months, with an employer contribution of 5% of salary." },
    NL: { "probation.months": "2", "collective.name": "CAO voor de Metaal en Techniek", "pension.terms": "the PMT sector pension fund." },
    GB: { "leave.public_holidays": "in_addition" },
    AU: { "pay.frequency": "bi_weekly", "collective.name": "Professional Employees Award 2020", "workplace.hours_per_week": "38" },
    NZ: { "pay.frequency": "bi_weekly", "notice.option": "custom", "notice.custom_period": "four weeks’ notice", "probation.months": "trial_90" },
    CA: { "pay.frequency": "bi_weekly", "probation.months": "3", "pension.terms": "a group RRSP with matching contributions of up to 4% of salary." },
    US: { "pay.frequency": "semi_monthly", "employment.flsa_status": "non_exempt", "acceptance.place": "New York, NY" },
  };
  const values: LetterState["values"] = { ...LENA_VALUES, ...byCountry[country] };
  if (country === "US") delete values["position.contract_type"];
  return values;
}
