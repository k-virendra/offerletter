import { describe, expect, it } from "vitest";
import { fieldSchema } from "../src/lib/content/schema";
import { loadContent, placeholderKeys } from "./content";

describe("content files", () => {
  const content = loadContent();

  it("load and pass every cross-check", () => {
    expect(content.jurisdictions.length).toBeGreaterThanOrEqual(14);
    expect(content.templates.map((t) => t.key)).toEqual(["classic", "modern", "minimal", "executive", "bold"]);
  });

  it("use A4 in Europe, Australia and New Zealand and US Letter in North America", () => {
    for (const j of content.jurisdictions) {
      const northAmerica = j.code === "US" || j.code === "CA" || j.code.startsWith("US-") || j.code.startsWith("CA-");
      expect(j.paper_size, j.code).toBe(northAmerica ? "letter" : "a4");
    }
  });

  it("give every core section a place in the letter", () => {
    const core = content.sections.filter((s) => s.always_included).map((s) => s.key);
    expect(core).toEqual(["candidate", "position", "compensation", "acceptance"]);
  });

  it("only use default accents that are readable as text on white", () => {
    for (const t of content.templates) {
      expect(contrastOnWhite(t.default_accent), t.key).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("field definitions", () => {
  it("refuse government ID numbers", () => {
    const result = fieldSchema.safeParse({ key: "candidate.passport_number", section_key: "candidate", label: "Passport", type: "text", sort_order: 1 });
    expect(result.success).toBe(false);
    const ssn = fieldSchema.safeParse({ key: "candidate.ssn", section_key: "candidate", label: "SSN", type: "text", sort_order: 1 });
    expect(ssn.success).toBe(false);
  });

  it("need options for select fields", () => {
    const result = fieldSchema.safeParse({ key: "probation.months", section_key: "probation", label: "Probation", type: "select", sort_order: 1 });
    expect(result.success).toBe(false);
  });
});

describe("placeholderKeys", () => {
  it("finds values and conditions", () => {
    expect(placeholderKeys("Hello {{candidate.full_name}}{{#if position.department}} in {{ position.department }}{{/if}}.")).toEqual([
      "candidate.full_name",
      "position.department",
    ]);
  });
});

function contrastOnWhite(hex: string): number {
  const n = Number.parseInt(hex.slice(1), 16);
  const channel = (c: number) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const lum = 0.2126 * channel((n >> 16) & 255) + 0.7152 * channel((n >> 8) & 255) + 0.0722 * channel(n & 255);
  return 1.05 / (lum + 0.05);
}
