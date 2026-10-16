// Countries a company can be registered in (ISO 3166-1 alpha-2, without uninhabited territories). This is the
// company's home country, which may differ from the country a letter is written for.

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
