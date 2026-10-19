// Countries a company can be registered in (ISO 3166-1 alpha-2, without uninhabited territories). Offer letters use
// the wording for the company's country.

const ISO_CODES = `AD AE AF AG AI AL AM AO AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BW BY
BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA
GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IM IN IO IQ IR IS IT JE JM JO JP KE KG KH KI
KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY
MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG
SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VG VI
VN VU WF WS YE YT ZA ZM ZW`.split(/\s+/);

export const COUNTRY_CODES = ISO_CODES as [string, ...string[]];

/** The launch markets, listed first in country pickers. */
export const LAUNCH_COUNTRY_CODES = ["DE", "IE", "NL", "GB", "AU", "NZ", "CA", "US"] as const;

const names = new Intl.DisplayNames(["en"], { type: "region" });

export function countryName(code: string): string {
  return names.of(code) ?? code;
}

export type CountryOption = { code: string; name: string };

export function countryOptions(): { launch: CountryOption[]; other: CountryOption[] } {
  const launch: readonly string[] = LAUNCH_COUNTRY_CODES;
  const toOption = (code: string) => ({ code, name: countryName(code) });
  return {
    launch: LAUNCH_COUNTRY_CODES.map(toOption),
    other: ISO_CODES.filter((code) => !launch.includes(code))
      .map(toOption)
      .sort((a, b) => a.name.localeCompare(b.name, "en")),
  };
}

// States and provinces (ISO 3166-2), asked for where employment law differs by them. Letters use a state's or
// province's own wording when there is some, and otherwise the country's.
const US_STATES = `AL Alabama|AK Alaska|AZ Arizona|AR Arkansas|CA California|CO Colorado|CT Connecticut|DE Delaware|DC District of Columbia|FL Florida|GA Georgia|HI Hawaii|ID Idaho|IL Illinois|IN Indiana|IA Iowa|KS Kansas|KY Kentucky|LA Louisiana|ME Maine|MD Maryland|MA Massachusetts|MI Michigan|MN Minnesota|MS Mississippi|MO Missouri|MT Montana|NE Nebraska|NV Nevada|NH New Hampshire|NJ New Jersey|NM New Mexico|NY New York|NC North Carolina|ND North Dakota|OH Ohio|OK Oklahoma|OR Oregon|PA Pennsylvania|RI Rhode Island|SC South Carolina|SD South Dakota|TN Tennessee|TX Texas|UT Utah|VT Vermont|VA Virginia|WA Washington|WV West Virginia|WI Wisconsin|WY Wyoming`;
const CA_PROVINCES = `AB Alberta|BC British Columbia|MB Manitoba|NB New Brunswick|NL Newfoundland and Labrador|NS Nova Scotia|NT Northwest Territories|NU Nunavut|ON Ontario|PE Prince Edward Island|QC Quebec|SK Saskatchewan|YT Yukon`;

export type RegionOption = { code: string; name: string };

function regionList(country: string, list: string): RegionOption[] {
  return list.split("|").map((entry) => ({ code: `${country}-${entry.slice(0, 2)}`, name: entry.slice(3) }));
}

/** Countries whose companies also give a state or province, with its label. */
export const REGIONS: Record<string, { label: "State" | "Province or territory"; options: RegionOption[] }> = {
  US: { label: "State", options: regionList("US", US_STATES) },
  CA: { label: "Province or territory", options: regionList("CA", CA_PROVINCES) },
};

export function regionName(code: string): string {
  return REGIONS[code.slice(0, 2)]?.options.find((region) => region.code === code)?.name ?? code;
}

/** "Germany", or "United States, California" for a company that gives a state (the order letters use too). */
export function placeName(countryCode: string, regionCode: string | null): string {
  return regionCode ? `${countryName(countryCode)}, ${regionName(regionCode)}` : countryName(countryCode);
}
