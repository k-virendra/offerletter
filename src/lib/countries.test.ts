import { describe, expect, it } from "vitest";
import { COUNTRY_CODES, countryName, countryOptions, LAUNCH_COUNTRY_CODES } from "./countries";

describe("countries", () => {
  it("has an English name for every code", () => {
    for (const code of COUNTRY_CODES) expect(countryName(code), code).not.toBe(code);
  });

  it("lists every code once, launch markets first", () => {
    const { launch, other } = countryOptions();
    expect(launch.map((c) => c.code)).toEqual([...LAUNCH_COUNTRY_CODES]);
    const all = [...launch, ...other].map((c) => c.code);
    expect(new Set(all).size).toBe(all.length);
    expect(all.length).toBe(COUNTRY_CODES.length);
    expect(countryName("GB")).toBe("United Kingdom");
  });
});
