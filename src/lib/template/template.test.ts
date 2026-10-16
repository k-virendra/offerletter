import { describe, expect, it } from "vitest";
import { formatDate, formatMoney, parseAmount, payFigures } from "./format";
import { parseBlocks, type Inline, type MdBlock } from "./markdown";
import { evaluateTemplate, parseTemplate, TemplateError, templateKeys, type ValueLookup } from "./parse";

function lookup(values: Record<string, string | boolean>): ValueLookup {
  return {
    truthy: (key) => Boolean(values[key]),
    raw: (key) => (typeof values[key] === "string" ? (values[key] as string) : values[key] ? "true" : ""),
  };
}

const render = (source: string, values: Record<string, string | boolean> = {}) => parseBlocks(evaluateTemplate(parseTemplate(source), lookup(values)));

/** Blocks as readable strings: placeholders become [key], bold **…**, italic *…*. */
function flat(inlines: Inline[]): string {
  return inlines
    .map((i) => (i.kind === "text" ? i.text : i.kind === "placeholder" ? `[${i.key}]` : i.kind === "strong" ? `**${flat(i.children)}**` : `*${flat(i.children)}*`))
    .join("");
}
function show(blocks: MdBlock[]) {
  return blocks.map((b) =>
    b.kind === "paragraph" || b.kind === "heading"
      ? `${b.kind}: ${flat(b.content)}`
      : b.kind === "list"
        ? `${b.ordered ? "ol" : "ul"}: ${b.items.map(flat).join(" | ")}`
        : `table(${b.align.join(",")}): ${b.header.map(flat).join(" | ")} / ${b.rows.map((r) => r.map(flat).join(" | ")).join(" / ")}`,
  );
}

describe("conditions", () => {
  const source = "Join us{{#if position.department}} in the {{position.department}} team{{/if}}.";

  it("keeps or drops wording around optional values", () => {
    expect(show(render(source, { "position.department": "Platform" }))).toEqual(["paragraph: Join us in the [position.department] team."]);
    expect(show(render(source))).toEqual(["paragraph: Join us."]);
  });

  it("supports else, unless, comparisons and and/or/not", () => {
    const notice = '{{#if notice.option == "custom"}}Agreed: {{notice.custom_period}}.{{else}}Statutory.{{/if}}';
    expect(show(render(notice, { "notice.option": "custom" }))).toEqual(["paragraph: Agreed: [notice.custom_period]."]);
    expect(show(render(notice, { "notice.option": "statutory" }))).toEqual(["paragraph: Statutory."]);
    expect(show(render('{{#if probation.months != "0"}}P{{/if}}', { "probation.months": "0" }))).toEqual([]);
    expect(show(render("{{#unless a.b}}U{{/unless}}"))).toEqual(["paragraph: U"]);
    expect(show(render("{{#if a.b or c.d}}X{{/if}}", { "c.d": true }))).toEqual(["paragraph: X"]);
    expect(show(render("{{#if a.b and not c.d}}X{{/if}}", { "a.b": true, "c.d": true }))).toEqual([]);
  });

  it("nests conditions", () => {
    const nested = "{{#if a.b}}A{{#if c.d}}C{{/if}}{{/if}}";
    expect(show(render(nested, { "a.b": true, "c.d": true }))).toEqual(["paragraph: AC"]);
    expect(show(render(nested, { "c.d": true }))).toEqual([]);
  });

  it("rejects broken templates with a clear message", () => {
    expect(() => parseTemplate("{{#if a.b}}never closed")).toThrow(TemplateError);
    expect(() => parseTemplate("{{/if}}")).toThrow("without a matching opening tag");
    expect(() => parseTemplate("{{ not a placeholder }}")).toThrow(TemplateError);
    expect(() => parseTemplate("{{#if a.b == unquoted}}x{{/if}}")).toThrow(TemplateError);
  });

  it("lists every field a template uses", () => {
    expect([...templateKeys(parseTemplate('{{#if a.b == "x" or not c.d}}{{e.f}}{{/if}}'))].sort()).toEqual(["a.b", "c.d", "e.f"]);
  });
});

describe("markdown subset", () => {
  it("reads paragraphs, headings, lists and bold or italic text", () => {
    const blocks = render("### Small heading\n\nFirst line\nsame paragraph with **bold** and *italic*.\n\n- one\n- {{a.b}}\n\n1. first\n2. second");
    expect(show(blocks)).toEqual([
      "heading: Small heading",
      "paragraph: First line same paragraph with **bold** and *italic*.",
      "ul: one | [a.b]",
      "ol: first | second",
    ]);
  });

  it("reads pipe tables with alignment", () => {
    const blocks = render("| Component | Gross amount |\n|---|---:|\n| Annual salary | {{pay.annual_amount}} |");
    expect(show(blocks)).toEqual(["table(left,right): Component | Gross amount / Annual salary | [pay.annual_amount]"]);
  });

  it("drops list items emptied by conditions", () => {
    const blocks = render("This offer depends on:\n\n{{#if a.b}}- proof of the right to work\n{{/if}}{{#if c.d}}- references\n{{/if}}", { "c.d": true });
    expect(show(blocks)).toEqual(["paragraph: This offer depends on:", "ul: references"]);
  });

  it("treats HTML and stray markers as plain text", () => {
    expect(show(render('<img src=x onerror="alert(1)"> 5 * 3 and a lone **'))).toEqual([
      'paragraph: <img src=x onerror="alert(1)"> 5 * 3 and a lone **',
    ]);
  });

  it("never reads values as Markdown", () => {
    // The value is a placeholder token, so "**" or "- " inside it can't become formatting.
    const blocks = render("{{candidate.full_name}}");
    expect(blocks).toEqual([{ kind: "paragraph", content: [{ kind: "placeholder", key: "candidate.full_name" }] }]);
  });
});

describe("formatting", () => {
  it("formats dates in the country's style without shifting the day", () => {
    expect(formatDate("2026-12-01", "en-DE")).toBe("1 December 2026");
    expect(formatDate("2026-12-01", "en-US")).toBe("December 1, 2026");
    expect(formatDate("2026-02-30", "en-GB")).toBe("2026-02-30");
  });

  it("formats money for text and tables", () => {
    expect(formatMoney(78000, "EUR", "en-DE")).toBe("€78,000");
    expect(formatMoney(78000, "EUR", "en-DE", true)).toBe("€78,000.00");
    expect(formatMoney(6500.5, "USD", "en-US")).toBe("$6,500.50");
    expect(formatMoney(95000, "AUD", "en-AU")).toBe("$95,000");
  });

  it("reads amounts the way people type them", () => {
    expect(parseAmount("78000")).toBe(78000);
    expect(parseAmount("78,000.50")).toBe(78000.5);
    expect(parseAmount("78 000")).toBe(78000);
    expect(parseAmount("seventy")).toBeNull();
    expect(parseAmount("78.000,00")).toBeNull();
  });

  it("works out annual pay and each payment", () => {
    expect(payFigures(78000, "year", "monthly")).toEqual({ annual: 78000, instalments: 12, perInstalment: 6500 });
    expect(payFigures(6500, "month", "monthly")).toEqual({ annual: 78000, instalments: 12, perInstalment: 6500 });
    expect(payFigures(100000, "year", "bi_weekly")).toEqual({ annual: 100000, instalments: 26, perInstalment: 3846.15 });
    expect(payFigures(null, "year", "monthly")).toBeNull();
  });
});
