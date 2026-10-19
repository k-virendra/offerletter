import { describe, expect, it } from "vitest";
import { loadContent } from "../../../scripts/content";
import type { JurisdictionOption } from "./context.server";
import { letterJurisdiction } from "./jurisdiction";

// Every content jurisdiction as New letter sees it locally: all of them have wording.
const OPTIONS: JurisdictionOption[] = loadContent().jurisdictions.map((j) => ({
  code: j.code,
  name: j.name,
  parentCode: j.parent_code ?? null,
  currency: j.currency,
  locale: j.locale,
  paperSize: j.paper_size,
  selectable: j.selectable ?? true,
  unavailable: j.parent_code && j.selectable === false ? (j.public_note ?? "Not available yet") : null,
  publicNote: j.public_note ?? null,
}));

const place = (country: string, region: string | null = null, options = OPTIONS) => letterJurisdiction(options, country, region);
const code = (country: string, region: string | null = null) => {
  const found = place(country, region);
  return found.ok ? found.jurisdiction.code : null;
};

describe("letterJurisdiction", () => {
  it("uses a state's or province's own wording, and the country's otherwise", () => {
    expect(code("DE")).toBe("DE");
    expect(code("US", "US-CA")).toBe("US-CA");
    expect(code("US", "US-NY")).toBe("US-NY");
    expect(code("US", "US-TX")).toBe("US");
    expect(code("CA", "CA-ON")).toBe("CA-ON");
    expect(place("US", "US-TX")).toMatchObject({ label: "United States, Texas", note: "Texas has no wording of its own, so letters use the federal version." });
    expect(place("US", "US-CA")).toMatchObject({ label: "United States, California", note: null });
  });

  it("says why there is no letter", () => {
    expect(place("IN")).toEqual({ ok: false, needsRegion: false, reason: "Offer letters for India aren’t available yet." });
    // Canada has no national wording: provinces without their own aren't covered.
    expect(place("CA", "CA-MB")).toEqual({ ok: false, needsRegion: false, reason: "Offer letters for Manitoba aren’t available yet." });
    expect(place("CA", "CA-QC")).toMatchObject({ ok: false, reason: expect.stringContaining("in French") });
    expect(place("US", "US-MT")).toMatchObject({ ok: false, reason: expect.stringContaining("Montana") });
    expect(place("US")).toMatchObject({ ok: false, needsRegion: true, reason: expect.stringContaining("state") });
    expect(place("CA")).toMatchObject({ ok: false, needsRegion: true, reason: expect.stringContaining("province") });
  });

  it("never swaps a state that isn't ready for the federal wording", () => {
    const notReady = OPTIONS.map((j) => (j.code === "US-CA" ? { ...j, unavailable: "Not available yet" } : j));
    expect(place("US", "US-CA", notReady)).toEqual({ ok: false, needsRegion: false, reason: "Offer letters for California aren’t available yet." });
    const countryOff = OPTIONS.map((j) => (j.code === "DE" ? { ...j, unavailable: "Not available yet" } : j));
    expect(place("DE", null, countryOff)).toMatchObject({ ok: false, reason: "Offer letters for Germany aren’t available yet." });
  });
});
