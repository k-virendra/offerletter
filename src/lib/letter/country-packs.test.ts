import { describe, expect, it } from "vitest";
import { buildLetterDocument, runsText } from "./build";
import { blockingProblems, crossFieldErrors, moveToJurisdiction, sectionLock } from "./fields";
import { EXAMPLE_ENGINEERING, sampleValues } from "./samples";
import { contextFor } from "./test-context";
import type { Block, LetterDocument, LetterState } from "./types";

// Every launch jurisdiction, built with complete sample answers: no gaps, the sections the law requires, the right
// paper and money, and a text snapshot of the letter for review (src/lib/letter/__snapshots__).

const LAUNCH = ["DE", "IE", "NL", "GB", "AU", "NZ", "CA-ON", "CA-BC", "CA-AB", "US", "US-CA", "US-NY"] as const;
const TODAY = "2026-10-16";

function sampleState(code: string): LetterState {
  const context = contextFor(code);
  const base: LetterState = {
    name: "Sample",
    templateKey: "classic",
    accentColor: null,
    values: sampleValues(code),
    removedSections: [],
  };
  return moveToJurisdiction(context, base).state;
}

const blockText = (block: Block): string =>
  block.kind === "list"
    ? block.items.map((item) => `- ${runsText(item)}`).join("\n")
    : block.kind === "table"
      ? [block.header, ...block.rows].map((row) => `| ${row.map(runsText).join(" | ")} |`).join("\n")
      : runsText(block.runs);

function letterText(doc: LetterDocument): string {
  return [
    `${doc.title.label}: ${runsText(doc.title.subject)}`,
    runsText(doc.dateLine),
    ...doc.opening.map(blockText),
    ...doc.sections.flatMap((section) => [`## ${section.title}`, ...section.blocks.map(blockText)]),
    ...doc.closing.map(blockText),
    `[${doc.signatures.company.heading}] [${doc.signatures.candidate.heading}: ${doc.signatures.candidate.note}]`,
    doc.feeLine,
  ].join("\n\n");
}

const EXPECTED_LOCKS: Record<(typeof LAUNCH)[number], string[]> = {
  DE: ["notice", "written_terms"],
  IE: ["written_terms"],
  NL: [],
  GB: ["pension", "written_terms"],
  AU: ["pension", "required_information"],
  NZ: ["pension", "required_information", "written_terms"],
  "CA-ON": [],
  "CA-BC": [],
  "CA-AB": [],
  US: ["at_will"],
  "US-CA": ["at_will", "required_information"],
  "US-NY": ["at_will", "required_information"],
};

describe.each(LAUNCH)("%s", (code) => {
  const context = contextFor(code);
  const state = sampleState(code);
  const doc = buildLetterDocument(context, EXAMPLE_ENGINEERING, state, { date: TODAY });

  it("has wording for every core section", () => {
    for (const key of ["candidate", "position", "compensation", "acceptance"]) expect(context.clauses[key], key).toBeDefined();
    expect(doc.title.label).toBe("Offer of employment");
  });

  it("builds a complete letter from complete answers", () => {
    const problems = blockingProblems(context, state, TODAY);
    expect(problems.missing.map((f) => f.key)).toEqual([]);
    expect(problems.invalid.map((p) => `${p.field.key}: ${p.message}`)).toEqual([]);
    expect(JSON.stringify(doc)).not.toContain('"kind":"missing"');
  });

  it("locks the sections the law requires", () => {
    const locked = context.sections
      .filter((section) => context.clauses[section.key] && !section.alwaysIncluded && sectionLock(context, section))
      .map((section) => section.key)
      .sort();
    expect(locked).toEqual(EXPECTED_LOCKS[code]);
  });

  it("uses the country's paper, money and dates", () => {
    expect(doc.paperSize).toBe(code.startsWith("US") || code.startsWith("CA") ? "letter" : "a4");
    const salary = doc.sections.find((s) => s.key === "compensation")!;
    expect(salary.blocks.map(blockText).join(" ")).toContain(
      { EUR: "€78,000", GBP: "£78,000", AUD: "$78,000", NZD: "$78,000", CAD: "$78,000", USD: "$78,000" }[context.jurisdiction.currency]!,
    );
  });

  it("reads as expected", () => {
    expect(letterText(doc)).toMatchSnapshot();
  });
});

describe("country rules", () => {
  it("limits Dutch probation by contract length", () => {
    const fixed = { "position.contract_type": "fixed_term", "position.start_date": "2026-12-01" };
    expect(crossFieldErrors({ ...fixed, "position.end_date": "2027-05-31", "probation.months": "1" }, "NL")["probation.months"]).toBe(
      "Fixed-term contracts of 6 months or less can’t have a probation period",
    );
    expect(crossFieldErrors({ ...fixed, "position.end_date": "2027-11-30", "probation.months": "2" }, "NL")["probation.months"]).toBe(
      "Fixed-term contracts shorter than 2 years allow at most 1 month of probation",
    );
    expect(crossFieldErrors({ ...fixed, "position.end_date": "2027-11-30", "probation.months": "1" }, "NL")).toEqual({});
    expect(crossFieldErrors({ ...fixed, "position.end_date": "2028-12-01", "probation.months": "2" }, "NL")).toEqual({});
    // Other countries don't apply the Dutch rule.
    expect(crossFieldErrors({ ...fixed, "position.end_date": "2027-05-31", "probation.months": "6" }, "DE")).toEqual({});
  });

  it("checks UK holiday when bank holidays are included", () => {
    expect(crossFieldErrors({ "leave.public_holidays": "included", "leave.days": "25" }, "GB")["leave.days"]).toBe(
      "With bank holidays included, the legal minimum is 28 days",
    );
    expect(crossFieldErrors({ "leave.public_holidays": "in_addition", "leave.days": "25" }, "GB")).toEqual({});
  });

  it("checks that a fixed term ends after it starts", () => {
    expect(crossFieldErrors({ "position.contract_type": "fixed_term", "position.start_date": "2026-12-01", "position.end_date": "2026-11-01" })).toEqual({
      "position.end_date": "The end date must be after the start date",
    });
  });
});

describe("moving a draft to another country", () => {
  it("keeps the answers that still apply and drops the rest", () => {
    const de = sampleState("DE");
    const { state, dropped } = moveToJurisdiction(contextFor("US-NY"), { ...de, removedSections: ["bonus"] });
    expect(state.values["candidate.full_name"]).toBe("Lena Hoffmann");
    expect(state.values["pay.base_amount"]).toBe("78000");
    // German-only and non-US fields go; US defaults come in.
    expect(dropped).toEqual(expect.arrayContaining(["info.third_country_national", "position.contract_type"]));
    expect(state.values["position.contract_type"]).toBeUndefined();
    expect(state.values["pay.frequency"]).toBe("monthly");
    expect(state.removedSections).toEqual(["bonus"]);
  });

  it("swaps choices the new country doesn't offer for its default", () => {
    const { state } = moveToJurisdiction(contextFor("NL"), { ...sampleState("DE"), values: { ...sampleState("DE").values, "probation.months": "6" } });
    expect(state.values["probation.months"]).toBe("2");
  });

  it("puts back a section the new country requires", () => {
    const { state } = moveToJurisdiction(contextFor("GB"), { ...sampleState("DE"), removedSections: ["pension", "bonus"] });
    expect(state.removedSections).toEqual(["bonus"]);
  });
});
