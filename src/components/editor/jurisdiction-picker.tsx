"use client";

import { Select } from "@/components/ui/field";
import { PAPER } from "@/letter-styles/kit";
import type { JurisdictionOption } from "@/lib/letter/context.server";
import { formatDate } from "@/lib/template/format";

// Country, then state or province where the law differs. Used by New letter and by "Change country".

/** The jurisdiction a country starts on: its first available state or province, or the country itself. */
export function defaultJurisdiction(jurisdictions: JurisdictionOption[], countryCode: string): string {
  const country = jurisdictions.find((j) => j.code === countryCode);
  const region = jurisdictions.find((j) => j.parentCode === countryCode && !j.unavailable);
  return region?.code ?? (country?.selectable ? countryCode : "");
}

export function JurisdictionPicker({
  jurisdictions,
  value,
  onChange,
  idPrefix,
  today,
}: {
  jurisdictions: JurisdictionOption[];
  value: string;
  onChange: (code: string) => void;
  idPrefix: string;
  today: string;
}) {
  const current = jurisdictions.find((j) => j.code === value);
  const countries = jurisdictions.filter((j) => !j.parentCode);
  const countryCode = current?.parentCode ?? current?.code ?? countries[0]?.code ?? "";
  const country = countries.find((j) => j.code === countryCode);
  const regions = jurisdictions.filter((j) => j.parentCode === countryCode);
  const regionLabel = countryCode === "CA" ? "Province" : "State";
  const hasRegions = (code: string) => jurisdictions.some((j) => j.parentCode === code);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-4">
        <div className="flex min-w-[240px] flex-col gap-1.5">
          <label htmlFor={`${idPrefix}-country`} className="text-sm font-medium">
            Country
          </label>
          <Select id={`${idPrefix}-country`} value={countryCode} onChange={(e) => onChange(defaultJurisdiction(jurisdictions, e.target.value))}>
            {countries.map((j) => (
              <option key={j.code} value={j.code} disabled={Boolean(j.unavailable) && !hasRegions(j.code)}>
                {j.name}
                {j.unavailable && !hasRegions(j.code) ? " (not available yet)" : ""}
              </option>
            ))}
          </Select>
        </div>
        {regions.length ? (
          <div className="flex min-w-[240px] flex-col gap-1.5">
            <label htmlFor={`${idPrefix}-region`} className="text-sm font-medium">
              {regionLabel}
            </label>
            <Select id={`${idPrefix}-region`} value={value} onChange={(e) => onChange(e.target.value)} aria-describedby={country?.publicNote ? `${idPrefix}-note` : undefined}>
              {regions.map((r) => (
                <option key={r.code} value={r.code} disabled={Boolean(r.unavailable)}>
                  {r.name}
                  {r.unavailable ? " (not available yet)" : ""}
                </option>
              ))}
              {country?.selectable ? <option value={country.code}>Another {regionLabel.toLowerCase()} (national wording)</option> : null}
            </Select>
          </div>
        ) : null}
        {current && !current.unavailable ? (
          <div className="flex flex-wrap gap-2 pb-2.5 text-[13px]">
            <span className="inline-flex h-7 items-center rounded-full bg-white px-2.5 ring-1 ring-line">{PAPER[current.paperSize].label} paper</span>
            <span className="inline-flex h-7 items-center rounded-full bg-white px-2.5 ring-1 ring-line">
              {current.currency} · {formatDate(today, current.locale)}
            </span>
          </div>
        ) : null}
      </div>
      {country?.publicNote ? (
        <p id={`${idPrefix}-note`} className="text-[13px] text-muted">
          {country.publicNote}
        </p>
      ) : null}
      {regions
        .filter((r) => r.unavailable && r.publicNote)
        .map((r) => (
          <p key={r.code} className="text-[13px] text-muted">
            {r.name}: {r.unavailable}
          </p>
        ))}
      {!current || current.unavailable ? (
        <p role="status" className="text-sm text-marigold-800">
          {current?.unavailable ? `${current.unavailable}. ` : ""}Choose another country for now.
        </p>
      ) : null}
    </div>
  );
}
