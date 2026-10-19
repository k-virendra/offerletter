import { countryName, REGIONS, regionName } from "@/lib/countries";
import type { JurisdictionOption } from "./context.server";

export type LetterPlace =
  | { ok: true; jurisdiction: JurisdictionOption; label: string; note: string | null }
  | { ok: false; reason: string; needsRegion: boolean };

/**
 * The wording a company's offer letters use: its state's or province's own when there is some, otherwise its
 * country's. New letter doesn't ask where the job is; this decides, on the screen and again on the server.
 */
export function letterJurisdiction(jurisdictions: JurisdictionOption[], countryCode: string, regionCode: string | null): LetterPlace {
  const regions = REGIONS[countryCode];
  if (regions && !regionCode) {
    const noun = regions.label === "State" ? "state" : "province or territory";
    return { ok: false, needsRegion: true, reason: `Add the company’s ${noun} in My companies to start a letter. Letters use its employment rules.` };
  }

  const place = regionCode ? regionName(regionCode) : countryName(countryCode);
  const unavailable = (reason?: string | null) => ({ ok: false as const, needsRegion: false, reason: reason ?? `Offer letters for ${place} aren’t available yet.` });
  const country = jurisdictions.find((j) => j.code === countryCode && !j.parentCode);
  if (!country) return unavailable();

  // A state or province with its own row has its own rules: it's never quietly swapped for the national wording.
  const region = regionCode ? jurisdictions.find((j) => j.code === regionCode) : undefined;
  if (region) return region.unavailable ? unavailable(region.publicNote) : { ok: true, jurisdiction: region, label: `${country.name}, ${region.name}`, note: null };

  if (!country.selectable || country.unavailable) return unavailable();
  return {
    ok: true,
    jurisdiction: country,
    label: regionCode ? `${country.name}, ${place}` : country.name,
    note: regionCode ? `${place} has no wording of its own, so letters use the ${countryCode === "US" ? "federal" : "national"} version.` : null,
  };
}
