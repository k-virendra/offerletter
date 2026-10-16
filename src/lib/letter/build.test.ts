import { describe, expect, it } from "vitest";
import { brandName, buildLetterDocument, runsText, splitAddress } from "./build";
import { blockingProblems, fieldError, missingFields, sanitizeValues, sectionLock } from "./fields";
import { resolveClauses, type ClauseRow } from "./resolve";
import { contextFor, EXAMPLE_ENGINEERING, LENA_VALUES } from "./test-context";
import type { Block, LetterDocument, LetterState } from "./types";

const de = contextFor("DE");
const state = (values = LENA_VALUES, removedSections: string[] = []): LetterState => ({
  name: "Offer for Lena",
  templateKey: "classic",
  accentColor: null,
  values,
  removedSections,
});
const build = (s = state(), context = de) => buildLetterDocument(context, EXAMPLE_ENGINEERING, s, { date: "2026-10-16" });

const blockText = (block: Block): string =>
  block.kind === "list"
    ? block.items.map(runsText).join(" | ")
    : block.kind === "table"
      ? [block.header.map(runsText).join(" | "), ...block.rows.map((row) => row.map(runsText).join(" | "))].join(" / ")
      : runsText(block.runs);
const sectionText = (doc: LetterDocument, key: string) => doc.sections.find((s) => s.key === key)?.blocks.map(blockText);
const chips = (doc: LetterDocument) =>
  JSON.stringify(doc)
    .match(/"kind":"missing","field":"([^"]+)"/g)
    ?.map((m) => m.split('"')[7]) ?? [];

describe("buildLetterDocument with the German draft clauses", () => {
  it("renders the design's sample letter", () => {
    const doc = build();
    expect(doc.title.label).toBe("Offer of employment");
    expect(runsText(doc.title.subject)).toBe("Senior Backend Engineer");
    expect(doc.opening.map(blockText)).toEqual([
      "Dear Lena,",
      "We are delighted to offer you the position of Senior Backend Engineer in our Platform team at Example Engineering GmbH. This letter sets out the main terms of our offer. Your employment contract will confirm these and the remaining terms in writing.",
    ]);
    expect(sectionText(doc, "compensation")).toEqual([
      "Your annual gross salary will be €78,000, paid in 12 equal instalments at the end of each month.",
      "Component | Gross amount / Annual salary | €78,000.00 / Each instalment (12 a year) | €6,500.00",
    ]);
    expect(sectionText(doc, "probation")).toEqual([
      "The first 6 months of your employment are a probation period. During probation, either party may end the employment with two weeks’ notice.",
    ]);
    expect(sectionText(doc, "conditions")).toEqual([
      "This offer depends on:",
      "proof of your right to work in Germany before your start date | references that are satisfactory to the company",
    ]);
    expect(runsText(doc.dateLine)).toBe("Munich, 16 October 2026");
    expect(doc.recipient.addressLines).toEqual(["Beispielweg 4", "80333 München"]);
    expect(doc.feeLine).toBe("Example Engineering GmbH never charges candidates fees.");
    expect(doc.company.wordmark).toBe("EXAMPLE ENGINEERING");
    expect(doc.sections.map((s) => s.key)).toEqual([
      "position",
      "workplace",
      "compensation",
      "bonus",
      "probation",
      "leave",
      "notice",
      "pension",
      "benefits",
      "relocation",
      "written_terms",
      "conditions",
    ]);
    expect(doc.sections.map((s) => s.number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
    expect(doc.unreviewed).toBe(true);
    expect(chips(doc)).toEqual([]);
  });

  it("drops optional wording, with its label, when the field is empty", () => {
    const doc = build(state({ ...LENA_VALUES, "position.department": "" }));
    expect(doc.opening[1] && blockText(doc.opening[1])).toContain("the position of Senior Backend Engineer at Example Engineering GmbH.");
  });

  it("shows chips for empty required fields and counts them", () => {
    const values = { ...LENA_VALUES, "position.reports_to": "", "pay.base_amount": "" };
    const doc = build(state(values));
    expect(new Set(chips(doc))).toEqual(new Set(["position.reports_to", "pay.base_amount"]));
    expect(missingFields(de, state(values)).map((f) => f.key)).toEqual(["position.reports_to", "pay.base_amount"]);
  });

  it("leaves out removed sections and sections that end up empty", () => {
    const doc = build(state({ ...LENA_VALUES, "conditions.right_to_work": false, "conditions.references": false }, ["bonus"]));
    expect(doc.sections.map((s) => s.key)).not.toContain("bonus");
    expect(doc.sections.map((s) => s.key)).not.toContain("conditions");
    // A removed section's required fields stop counting.
    expect(missingFields(de, state({ ...LENA_VALUES, "bonus.terms": "" }, ["bonus"]))).toEqual([]);
  });

  it("works out monthly pay and switches the wording", () => {
    const doc = build(state({ ...LENA_VALUES, "pay.base_amount": "6500", "pay.period": "month" }));
    expect(sectionText(doc, "compensation")?.[0]).toBe("Your monthly gross salary will be €6,500, paid in 12 equal instalments at the end of each month.");
  });

  it("uses the brand colour, darkened when it's too light", () => {
    expect(build().accent).toBe("#1F4E8C");
    expect(build({ ...state(), accentColor: "#F2A541" }).accent).toBe("#8E6227");
  });

  it("keeps whatever people type as plain text", () => {
    const doc = build(state({ ...LENA_VALUES, "candidate.full_name": '<script>alert(1)</script> **Lena**' }));
    expect(doc.recipient.name).toEqual([{ kind: "value", text: '<script>alert(1)</script> **Lena**', field: "candidate.full_name" }]);
  });
});

describe("United States and New York", () => {
  const ny = contextFor("US-NY");
  const values: LetterState["values"] = {
    ...LENA_VALUES,
    "candidate.full_name": "Jordan Rivera",
    "candidate.greeting_name": "Jordan",
    "pay.base_amount": "132000",
    "pay.frequency": "semi_monthly",
    "employment.flsa_status": "exempt",
    "acceptance.place": "New York, NY",
  };

  it("uses New York wording on top of the federal wording", () => {
    const doc = build(state(values), ny);
    expect(doc.paperSize).toBe("letter");
    expect(sectionText(doc, "compensation")?.[0]).toBe("Your starting salary will be $132,000 a year, paid twice a month under the company’s normal payroll practices.");
    expect(sectionText(doc, "compensation")?.[1]).toContain("Each payment (24 a year) | $5,500.00");
    expect(sectionText(doc, "required_information")?.[0]).toContain("New York Labor Law");
    expect(doc.sections.map((s) => s.key)).not.toContain("probation");
    expect(runsText(doc.dateLine)).toBe("October 16, 2026");
  });

  it("locks the sections each country requires", () => {
    const section = (key: string) => ny.sections.find((s) => s.key === key)!;
    expect(sectionLock(ny, section("at_will"))).toBe("Included in every US letter");
    expect(sectionLock(ny, section("required_information"))).toBe("Required in New York");
    expect(sectionLock(ny, section("bonus"))).toBeNull();
    expect(sectionLock(de, section("notice"))).toBe("Required in Germany");
    expect(sectionLock(de, section("position"))).toBe("Included in every letter");
  });

  it("applies country overrides to fields", () => {
    const flsa = ny.fields.find((f) => f.key === "employment.flsa_status")!;
    expect(flsa.required).toBe(true);
    // Fields limited to some countries don't exist elsewhere.
    expect(de.fields.find((f) => f.key === "employment.flsa_status")).toBeUndefined();
    expect(ny.fields.find((f) => f.key === "position.contract_type")).toBeUndefined();
    expect(ny.fields.find((f) => f.key === "leave.days")!.label).toBe("Paid time off (days a year)");
  });
});

describe("clause resolution", () => {
  const row = (over: Partial<ClauseRow>): ClauseRow => ({
    id: "x",
    section_key: "notice",
    jurisdiction_code: "US",
    title: null,
    body: "Federal",
    locked: false,
    locked_reason: null,
    editor_help: null,
    review_status: "approved",
    version: 1,
    ...over,
  });
  const chain = [
    { code: "US-CA", name: "California" },
    { code: "US", name: "United States" },
  ];

  it("picks the most specific approved clause", () => {
    const rows = [row({ id: "us" }), row({ id: "ca", jurisdiction_code: "US-CA", body: "California" })];
    expect(resolveClauses(rows, chain, false).notice?.id).toBe("ca");
  });

  it("skips drafts in production and uses them only when allowed", () => {
    const rows = [row({ id: "us" }), row({ id: "ca-draft", jurisdiction_code: "US-CA", review_status: "draft" })];
    expect(resolveClauses(rows, chain, false).notice?.id).toBe("us");
    expect(resolveClauses(rows, chain, true).notice?.id).toBe("ca-draft");
    expect(resolveClauses([row({ review_status: "draft" })], chain, false).notice).toBeUndefined();
  });

  it("prefers approved over newer drafts at the same level, and keeps any lock", () => {
    const rows = [row({ id: "v1" }), row({ id: "v2", version: 2, review_status: "draft", locked: true, locked_reason: "Required" })];
    const resolved = resolveClauses(rows, chain, true).notice!;
    expect(resolved.id).toBe("v1");
    expect(resolved.locked).toBe(false);
    const lockedV1 = resolveClauses([row({ id: "v1", locked: true, locked_reason: "Required in the US" })], chain, false).notice!;
    expect(lockedV1.lockedReason).toBe("Required in the US");
  });
});

describe("field rules", () => {
  const field = (key: string) => de.fields.find((f) => f.key === key)!;

  it("explains invalid values", () => {
    expect(fieldError(field("pay.base_amount"), "seventy", "2026-10-16")).toBe("Enter an amount in numbers, like 78000");
    expect(fieldError(field("leave.days"), "12", "2026-10-16")).toBe("Enter a number from 20 to 60");
    expect(fieldError(field("position.start_date"), "2026-10-01", "2026-10-16")).toBe("Choose a date after today");
    expect(fieldError(field("position.job_title"), "x".repeat(121), "2026-10-16")).toBe("Keep this under 120 characters");
    expect(fieldError(field("position.job_title"), "", "2026-10-16")).toBeUndefined();
  });

  it("checks that the reply-by date comes before the start date", () => {
    const problems = blockingProblems(de, state({ ...LENA_VALUES, "acceptance.reply_by": "2026-12-05" }), "2026-10-16");
    expect(problems.invalid.map((p) => [p.field.key, p.message])).toEqual([["acceptance.reply_by", "The reply-by date must be before the start date"]]);
  });

  it("keeps only known fields from the browser", () => {
    expect(sanitizeValues(de.fields, { "candidate.full_name": "Lena", "conditions.references": true, "evil.key": "x", "conditions.right_to_work": "yes" })).toEqual({
      "candidate.full_name": "Lena",
      "conditions.references": true,
    });
  });
});

describe("names and addresses", () => {
  it("drops the legal form for wordmarks", () => {
    expect(brandName("Example Engineering GmbH", null)).toBe("Example Engineering");
    expect(brandName("Sample Analytics Inc.", null)).toBe("Sample Analytics");
    expect(brandName("Example Studio Pty Ltd", null)).toBe("Example Studio");
    expect(brandName("Sample Foods Ltd", "Sample Foods")).toBe("Sample Foods");
    expect(brandName("Inc.", null)).toBe("Inc.");
  });

  it("splits addresses on lines or commas", () => {
    expect(splitAddress("Beispielweg 4\n80333 München")).toEqual(["Beispielweg 4", "80333 München"]);
    expect(splitAddress("100 Example Avenue, Suite 400, New York, NY 10001")).toEqual(["100 Example Avenue", "Suite 400", "New York", "NY 10001"]);
  });
});

describe("field defaults", () => {
  it("applies country defaults", () => {
    expect(contextFor("DE").fields.find((f) => f.key === "pay.frequency")!.defaultValue).toBe("monthly");
    expect(contextFor("US-NY").fields.find((f) => f.key === "pay.frequency")!.defaultValue).toBe("semi_monthly");
    expect(contextFor("DE").fields.find((f) => f.key === "conditions.right_to_work")!.defaultValue).toBe(true);
  });
});
