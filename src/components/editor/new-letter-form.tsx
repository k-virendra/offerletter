"use client";

import { Building2, Check, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useActionState, useMemo, useState } from "react";
import { createLetter, type CreateLetterResult } from "@/app/(editor)/letters/actions";
import { CompanyDrawer } from "@/components/companies/company-drawer";
import { CompanyForm } from "@/components/companies/company-form";
import { defaultJurisdiction, JurisdictionPicker } from "@/components/editor/jurisdiction-picker";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { LetterPages } from "@/letter-styles/letter-pages";
import { PAPER } from "@/letter-styles/kit";
import { readableAccent } from "@/lib/color";
import { companyInitials, letterSummaryShort } from "@/lib/companies/format";
import type { CountryOption } from "@/lib/countries";
import { countryName } from "@/lib/countries";
import type { JurisdictionOption } from "@/lib/letter/context.server";
import { buildLetterDocument } from "@/lib/letter/build";
import type { LetterCompany, LetterContext, LetterState } from "@/lib/letter/types";
import { todayIso } from "@/lib/template/format";
import { cn } from "@/lib/utils";

type CompanyChoice = {
  summary: { id: string; name: string; countryCode: string; paid: number; drafts: number };
  letterCompany: LetterCompany;
};

// Fictional sample content for the style thumbnails only. Real letters start empty.
const SAMPLE_VALUES: LetterState["values"] = {
  "candidate.full_name": "Alex Morgan",
  "candidate.greeting_name": "Alex",
  "candidate.address": "1 Sample Street\nExample City",
  "position.job_title": "Senior Product Designer",
  "position.department": "Design",
  "position.reports_to": "Sam Taylor, Head of Design",
  "position.start_date": "2026-12-01",
  "workplace.location": "our main office",
  "workplace.hours_per_week": "40",
  "pay.base_amount": "72000",
  "pay.period": "year",
  "pay.frequency": "monthly",
  "employment.flsa_status": "exempt",
  "bonus.terms": "up to 10% of your annual salary",
  "probation.months": "6",
  "leave.days": "25",
  "notice.option": "statutory",
  "benefits.description": "a learning budget and a public transport allowance",
  "relocation.description": "a relocation allowance",
  "conditions.right_to_work": true,
  "acceptance.reply_by": "2026-11-13",
  "acceptance.place": "Example City",
  "signatory.name": "Jamie Lee",
  "signatory.title": "Head of People",
};

export function NewLetterForm({
  companies,
  initialCompanyId,
  hasArchivedOnly,
  placesLeft,
  limit,
  addingCompany,
  jurisdictions,
  sampleContexts,
  countries,
}: {
  companies: CompanyChoice[];
  initialCompanyId?: string;
  hasArchivedOnly: boolean;
  placesLeft: number;
  limit: number;
  addingCompany: boolean;
  jurisdictions: JurisdictionOption[];
  sampleContexts: { a4: LetterContext | null; letter: LetterContext | null };
  countries: { launch: CountryOption[]; other: CountryOption[] };
}) {
  const router = useRouter();
  const [chosenId, setCompanyId] = useState(initialCompanyId);
  // After adding a company (inline or in the drawer) the page comes back with it as initialCompanyId.
  const company = companies.find((c) => c.summary.id === chosenId) ?? companies.find((c) => c.summary.id === initialCompanyId);
  const companyId = company?.summary.id;

  // Letters start in the company's home country when it's available, otherwise in the first one that is.
  const startFor = (choice?: CompanyChoice) => {
    const countries = jurisdictions.filter((j) => !j.parentCode).map((j) => j.code);
    for (const code of [choice?.summary.countryCode ?? "", ...countries]) {
      const start = code ? defaultJurisdiction(jurisdictions, code) : "";
      if (start && !jurisdictions.find((j) => j.code === start)?.unavailable) return start;
    }
    return defaultJurisdiction(jurisdictions, countries[0] ?? "");
  };
  const [jurisdictionCode, setJurisdictionCode] = useState(() => startFor(company));
  const jurisdiction = jurisdictions.find((j) => j.code === jurisdictionCode);
  const country = jurisdictions.find((j) => j.code === (jurisdiction?.parentCode ?? jurisdiction?.code));

  const [templateKey, setTemplateKey] = useState("classic");
  const [result, action, pending] = useActionState<CreateLetterResult | null, FormData>(async (_prev, formData) => createLetter(formData), null);

  const sample = jurisdiction?.paperSize === "letter" ? (sampleContexts.letter ?? sampleContexts.a4) : (sampleContexts.a4 ?? sampleContexts.letter);
  const today = todayIso();
  const thumbnails = useMemo(() => {
    if (!sample || !company) return [];
    return sample.templates.map((template) => ({
      template,
      doc: buildLetterDocument(sample, company.letterCompany, { name: "", templateKey: template.key, accentColor: null, values: SAMPLE_VALUES, removedSections: [] }, { date: today }),
    }));
  }, [sample, company, today]);

  const blocked = !jurisdiction || Boolean(jurisdiction.unavailable) || !company;
  const summary = [
    company?.summary.name,
    jurisdiction ? (country && country.code !== jurisdiction.code ? `${country.name}, ${jurisdiction.name}` : jurisdiction.name) : null,
    sample?.templates.find((t) => t.key === templateKey)?.name,
    jurisdiction ? PAPER[jurisdiction.paperSize].label : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="flex min-h-dvh flex-col bg-canvas">
      <header className="flex flex-wrap items-center gap-4 border-b border-line bg-white px-4 py-3 md:px-6">
        <Link href="/dashboard" className="inline-flex min-h-11 items-center text-sm font-semibold text-evergreen-600">
          ← Letters
        </Link>
        <nav aria-label="Letter progress" className="flex-1">
          <ol className="flex flex-wrap items-center justify-center gap-2 text-sm">
            {["Company, country and style", "Details", "Pay and download"].map((step, index) => (
              <li key={step} aria-current={index === 0 ? "step" : undefined} className={cn("inline-flex items-center gap-2", index === 0 ? "font-semibold text-ink" : "text-muted")}>
                {index > 0 ? <span aria-hidden className="mx-1 h-px w-6 bg-line" /> : null}
                <span
                  className={cn(
                    "inline-flex size-6 items-center justify-center rounded-full text-xs font-semibold",
                    index === 0 ? "bg-evergreen-600 text-white" : "border border-control text-ink-2",
                  )}
                >
                  {index + 1}
                </span>
                {step}
              </li>
            ))}
          </ol>
        </nav>
      </header>

      <main className="mx-auto w-full max-w-[1120px] flex-1 px-4 pt-8 pb-36 md:px-6">
        <h1 className="font-display text-4xl font-medium tracking-tight">New letter</h1>

        <div className="mt-6 flex flex-col gap-8">
          {/* Outside the letter form: on a first letter this holds the company form, and forms can't nest. */}
          <fieldset className="flex flex-col gap-3">
            <legend className="text-lg font-semibold">Company</legend>
            {companies.length ? (
              <>
                <p className="-mt-1 text-sm text-ink-2">Its details, logo, brand colour and signatory fill in automatically.</p>
                <div className="grid grid-cols-[repeat(auto-fill,minmax(min(300px,100%),1fr))] gap-3">
                  {companies.map((choice) => {
                    const accent = choice.letterCompany.brandColor ? readableAccent(choice.letterCompany.brandColor).hex : "#3D4451";
                    const checked = choice.summary.id === companyId;
                    return (
                      <label
                        key={choice.summary.id}
                        className={cn(
                          "flex min-h-[72px] cursor-pointer items-center gap-3 rounded-xl border bg-white px-4 py-3 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-evergreen-600",
                          checked ? "border-2 border-evergreen-600 bg-hover-soft" : "border-line",
                        )}
                      >
                        <input
                          type="radio"
                          name="company"
                          className="sr-only"
                          checked={checked}
                          onChange={() => {
                            setCompanyId(choice.summary.id);
                            setJurisdictionCode(startFor(choice));
                          }}
                        />
                        <span aria-hidden className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg border border-line bg-white font-serif font-semibold" style={{ color: accent }}>
                          {companyInitials(choice.summary.name)}
                        </span>
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span className="truncate font-semibold">{choice.summary.name}</span>
                          <span className="text-[13px] text-muted">
                            {countryName(choice.summary.countryCode)} · {letterSummaryShort(choice.summary.paid, choice.summary.drafts)}
                          </span>
                        </span>
                        {checked ? <Check aria-hidden className="size-5 text-evergreen-600" /> : null}
                      </label>
                    );
                  })}
                  {placesLeft > 0 ? (
                    <Link
                      href="/letters/new?add-company=1"
                      scroll={false}
                      className="flex min-h-[72px] items-center gap-3 rounded-xl border-2 border-dashed border-[#A3AAB2] px-4 text-evergreen-600 no-underline hover:bg-hover-soft"
                    >
                      <Plus aria-hidden className="size-5" />
                      <span className="flex flex-col">
                        <span className="font-semibold">Add a company</span>
                        <span className="text-[13px] text-ink-2">
                          {placesLeft} of {limit} places left
                        </span>
                      </span>
                    </Link>
                  ) : null}
                </div>
              </>
            ) : hasArchivedOnly ? (
              <p className="rounded-xl border border-line bg-white px-4 py-3 text-sm text-ink-2">
                Your companies are archived or paused. <Link href="/companies">Restore one in My companies</Link>
                {placesLeft > 0 ? (
                  <>
                    {" "}
                    or <Link href="/letters/new?add-company=1">add a new company</Link>
                  </>
                ) : null}
                .
              </p>
            ) : (
              <div className="overflow-hidden rounded-xl border border-line bg-white shadow-card">
                <div className="flex items-start gap-3 border-b border-line-soft px-5 py-4">
                  <Building2 aria-hidden className="mt-0.5 size-5 text-evergreen-600" />
                  <div>
                    <h2 className="font-semibold">Your company</h2>
                    <p className="text-sm text-ink-2">Enter it once. It’s saved to My companies, so every letter after this starts filled in.</p>
                  </div>
                </div>
                <div className="flex max-h-[720px] flex-col">
                  <CompanyForm
                    countries={countries}
                    footerNote={`This uses place 1 of ${limit}.`}
                    onCancel={() => router.push("/dashboard")}
                    onSaved={(saved) => {
                      toast("Company saved. It will fill in on your next letter.");
                      router.replace(`/letters/new?company=${saved.id}`);
                      router.refresh();
                    }}
                  />
                </div>
              </div>
            )}
          </fieldset>

          <form id="new-letter" action={action} className="flex flex-col gap-8">
            <input type="hidden" name="company_id" value={company?.summary.id ?? ""} />
            <input type="hidden" name="jurisdiction_code" value={jurisdiction?.code ?? ""} />
            <input type="hidden" name="template_key" value={templateKey} />

            <fieldset className="flex flex-col gap-3" disabled={!company}>
              <legend className="text-lg font-semibold">Where is the job?</legend>
              <p className="-mt-1 text-sm text-ink-2">This sets the wording, currency, date format and paper size. It can be different from where the company is registered.</p>
              <JurisdictionPicker jurisdictions={jurisdictions} value={jurisdictionCode} onChange={setJurisdictionCode} idPrefix="new-letter" today={today} />
            </fieldset>

            <fieldset className="flex flex-col gap-3" disabled={!company}>
              <legend className="text-lg font-semibold">Letter style</legend>
              <p className="-mt-1 text-sm text-ink-2">
                {company ? `Previews use ${company.summary.name}’s brand colour. ` : ""}You can switch style any time before paying.
              </p>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(196px,1fr))] gap-4">
                {thumbnails.map(({ template, doc }) => {
                  const checked = template.key === templateKey;
                  const paper = PAPER[doc.paperSize];
                  const scale = 196 / paper.width;
                  return (
                    <label
                      key={template.key}
                      className={cn(
                        "flex cursor-pointer flex-col overflow-hidden rounded-xl border bg-white has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-evergreen-600",
                        checked ? "border-2 border-evergreen-600" : "border-line",
                      )}
                    >
                      <span aria-hidden className="block overflow-hidden border-b border-line bg-desk" style={{ height: Math.round(paper.height * scale) }}>
                        <span className="block origin-top-left" style={{ width: paper.width, transform: `scale(${scale})` }}>
                          <LetterPages doc={doc} onlyFirstPage gap={0} />
                        </span>
                      </span>
                      <span className="flex min-h-11 items-center gap-2 px-3 py-2">
                        <input type="radio" name="style" value={template.key} checked={checked} onChange={() => setTemplateKey(template.key)} className="size-4 accent-evergreen-600" />
                        <span className="flex flex-col">
                          <span className="text-sm font-semibold">{template.name}</span>
                          {template.description ? <span className="text-xs text-muted">{template.description}</span> : null}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </fieldset>
          </form>
        </div>
      </main>

      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-white">
        <div className="mx-auto flex max-w-[1120px] flex-wrap items-center gap-3 px-4 py-3 md:px-6">
          <span className="min-w-0 flex-1 text-sm text-ink-2">{summary}</span>
          {result && !result.ok ? (
            <span role="alert" className="basis-full text-sm text-danger sm:basis-auto">
              {result.message}
            </span>
          ) : null}
          <Button asChild variant="ghost">
            <Link href="/dashboard">Cancel</Link>
          </Button>
          <Button type="submit" form="new-letter" disabled={blocked || pending}>
            {pending ? "Starting…" : "Continue to details"}
          </Button>
        </div>
      </div>

      {addingCompany && placesLeft > 0 ? (
        <CompanyDrawer
          countries={countries}
          footerNote={`This uses place ${limit - placesLeft + 1} of ${limit}.`}
          closeHref="/letters/new"
          savedHref={(id) => `/letters/new?company=${id}`}
        />
      ) : null}
    </div>
  );
}
