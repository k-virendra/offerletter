import { normalizeHex, readableAccent, tintOf } from "@/lib/color";
import { formatDate, formatMoney, formatNumber, parseAmount, payFigures } from "@/lib/template/format";
import { parseBlocks, type Inline, type MdBlock } from "@/lib/template/markdown";
import { evaluateTemplate, parseTemplate, type TemplateNode, type ValueLookup } from "@/lib/template/parse";
import { isEmptyValue, letterSections } from "./fields";
import type { Block, DocumentSection, FieldDefinition, LetterCompany, LetterContext, LetterDocument, LetterState, Run } from "./types";

// Builds the style-independent document from content, company and the user's values. Pure and synchronous: the
// live preview calls it on every change, and the PDF renderer calls it with the same inputs.

const templateCache = new Map<string, TemplateNode[]>();
function compiled(body: string): TemplateNode[] {
  let nodes = templateCache.get(body);
  if (!nodes) {
    nodes = parseTemplate(body);
    templateCache.set(body, nodes);
  }
  return nodes;
}

const LEGAL_SUFFIX = /[\s,]+(gmbh(\s*&\s*co\.?\s*kg)?|ag|se|kg|inc\.?|incorporated|llc|l\.l\.c\.|ltd\.?|limited|pty\.?\s+ltd\.?|plc|bv|b\.v\.|nv|corp\.?|corporation|co\.?)$/i;

/** "Example Engineering GmbH" → "Example Engineering", for wordmarks and running headers. */
export function brandName(legalName: string, tradingName: string | null): string {
  if (tradingName?.trim()) return tradingName.trim();
  let name = legalName.trim();
  for (let i = 0; i < 2 && LEGAL_SUFFIX.test(name); i++) name = name.replace(LEGAL_SUFFIX, "");
  return name || legalName.trim();
}

export function splitAddress(address: string): string[] {
  const lines = address.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  return lines.length > 1 ? lines : address.split(/,\s*/).map((line) => line.trim()).filter(Boolean);
}

/** Fills {{name}} parts of a phrase with text or runs. */
export function phraseRuns(template: string, parts: Record<string, string | Run[]>): Run[] {
  const runs: Run[] = [];
  let last = 0;
  for (const match of template.matchAll(/\{\{(\w+)\}\}/g)) {
    if (match.index > last) runs.push({ kind: "text", text: template.slice(last, match.index) });
    const part = parts[match[1] ?? ""];
    if (typeof part === "string") runs.push({ kind: "text", text: part });
    else if (part) runs.push(...part);
    last = match.index + match[0].length;
  }
  if (last < template.length) runs.push({ kind: "text", text: template.slice(last) });
  return runs;
}

export function phraseText(template: string, parts: Record<string, string>): string {
  return template.replace(/\{\{(\w+)\}\}/g, (_, name: string) => parts[name] ?? "");
}

export function runsText(runs: Run[]): string {
  return runs.map((run) => (run.kind === "text" || run.kind === "value" ? run.text : run.kind === "missing" ? "" : runsText(run.children))).join("");
}

const hasContent = (runs: Run[]): boolean =>
  runs.some((run) => (run.kind === "text" ? run.text.trim() !== "" : run.kind === "strong" || run.kind === "em" ? hasContent(run.children) : true));

export type BuildOptions = {
  /** The letter date (YYYY-MM-DD): today for drafts, the issue date for paid letters. */
  date: string;
};

export function buildLetterDocument(context: LetterContext, company: LetterCompany, state: LetterState, options: BuildOptions): LetterDocument {
  const { jurisdiction, phrases } = context;
  const { locale, currency } = jurisdiction;
  const fields = new Map(context.fields.map((field) => [field.key, field]));
  const values = state.values;
  const template = context.templates.find((t) => t.key === state.templateKey) ?? context.templates[0];

  const raw = (key: string) => {
    const value = values[key];
    return typeof value === "string" ? value.trim() : value ? "true" : "";
  };
  const pay = payFigures(parseAmount(raw("pay.base_amount")), raw("pay.period") || "year", raw("pay.frequency") || "monthly");
  const frequencyLabel = fields.get("pay.frequency")?.options.find((o) => o.value === (raw("pay.frequency") || "monthly"))?.label;

  const company_: Record<string, string> = {
    "company.legal_name": company.legalName,
    "company.trading_name": company.tradingName ?? "",
    "company.display_name": company.tradingName || company.legalName,
    "company.registered_address": company.registeredAddress,
    "company.registration_number": company.registrationNumber,
    "company.website": company.website ?? "",
    "company.contact_phone": company.contactPhone,
    "company.contact_email": company.contactEmail,
    "jurisdiction.name": jurisdiction.name,
    "letter.date": formatDate(options.date, locale),
  };

  /** Built-in values that depend on pay come from the base salary field, so a missing salary shows one chip. */
  const derived = (key: string, exact: boolean): string | null => {
    if (!pay) return null;
    switch (key) {
      case "pay.annual_amount":
        return formatMoney(pay.annual, currency, locale, exact);
      case "pay.period_amount":
        return formatMoney(pay.perInstalment, currency, locale, true);
      case "pay.instalments":
        return String(pay.instalments);
      case "pay.frequency_label":
        return frequencyLabel ? frequencyLabel.charAt(0).toLowerCase() + frequencyLabel.slice(1) : "";
      default:
        return null;
    }
  };

  const lookup: ValueLookup = {
    truthy: (key) => (key in company_ ? Boolean(company_[key]) : key.startsWith("pay.") && !fields.has(key) ? pay !== null : !isEmptyValue(values[key])),
    raw: (key) => (key in company_ ? (company_[key] ?? "") : raw(key)),
  };

  const formatValue = (field: FieldDefinition, value: string, exact: boolean): string => {
    switch (field.type) {
      case "date":
        return formatDate(value, locale);
      case "money": {
        const amount = parseAmount(value);
        return amount === null ? value : formatMoney(amount, currency, locale, exact);
      }
      case "number": {
        const number = Number(value);
        return Number.isFinite(number) ? formatNumber(number, locale) : value;
      }
      case "select":
        return field.options.find((option) => option.value === value)?.label ?? value;
      default:
        return value;
    }
  };

  /** A placeholder as runs: the value, a chip for an empty required field, or nothing. */
  const placeholderRuns = (key: string, exact = false): Run[] => {
    if (key in company_) return company_[key] ? [{ kind: "text", text: company_[key] }] : [];
    const field = fields.get(key);
    if (!field) {
      const text = derived(key, exact);
      if (text !== null) return [{ kind: "value", text, field: "pay.base_amount" }];
      const base = fields.get("pay.base_amount");
      return key.startsWith("pay.") && base ? [{ kind: "missing", field: base.key, label: base.label }] : [];
    }
    const value = values[key];
    // Shown outside an {{#if}}, an empty value is a gap in the letter, so it's a chip even for optional fields.
    if (value === undefined || isEmptyValue(value)) return [{ kind: "missing", field: key, label: field.label }];
    if (typeof value === "boolean") return [{ kind: "value", text: value ? "Yes" : "No", field: key }];
    return [{ kind: "value", text: formatValue(field, value.trim(), exact), field: key }];
  };

  const inlineRuns = (inlines: Inline[], exact = false): Run[] =>
    inlines.flatMap((inline): Run[] => {
      if (inline.kind === "text") return [{ kind: "text", text: inline.text }];
      if (inline.kind === "placeholder") return placeholderRuns(inline.key, exact);
      const children = inlineRuns(inline.children, exact);
      return children.length ? [{ kind: inline.kind, children }] : [];
    });

  const toBlocks = (md: MdBlock[]): Block[] =>
    md.flatMap((block): Block[] => {
      switch (block.kind) {
        case "paragraph":
        case "heading": {
          const runs = inlineRuns(block.content);
          return hasContent(runs) ? [{ kind: block.kind, runs }] : [];
        }
        case "list": {
          const items = block.items.map((item) => inlineRuns(item)).filter(hasContent);
          return items.length ? [{ kind: "list", ordered: block.ordered, items }] : [];
        }
        case "table": {
          const rows = block.rows.map((row) => row.map((cell) => inlineRuns(cell, true))).filter((row) => row.some(hasContent));
          return rows.length ? [{ kind: "table", align: block.align, header: block.header.map((cell) => inlineRuns(cell)), rows }] : [];
        }
      }
    });

  const sectionBlocks = (key: string): Block[] => {
    const clause = context.clauses[key];
    return clause ? toBlocks(parseBlocks(evaluateTemplate(compiled(clause.body), lookup))) : [];
  };

  const visible = letterSections(context, state.removedSections);
  const bodySections: DocumentSection[] = [];
  let number = 0;
  for (const section of visible) {
    if (section.key === "candidate" || section.key === "acceptance") continue;
    const blocks = sectionBlocks(section.key);
    if (!blocks.length) continue;
    const clauseTitle = context.clauses[section.key]?.title;
    bodySections.push({
      key: section.key,
      title: clauseTitle || section.title,
      shortTitle: section.shortTitle,
      showHeading: section.showHeading,
      number: section.showHeading ? ++number : null,
      blocks,
    });
  }

  const accentSource = normalizeHex(state.accentColor ?? "") ?? normalizeHex(company.brandColor ?? "") ?? template?.defaultAccent ?? "#1F4E8C";
  const accent = readableAccent(accentSource).hex;
  const candidateName = placeholderRuns("candidate.full_name");
  const place = placeholderRuns("acceptance.place");
  const date = formatDate(options.date, locale);
  const phrase = (key: string) => phrases[key] ?? "";
  const titleLabel = context.clauses.candidate?.title || phrase("title") || "Offer of employment";

  const keyFacts: LetterDocument["keyFacts"] = [
    { id: "role", label: phrase("facts.role"), value: placeholderRuns("position.job_title") },
    { id: "start_date", label: phrase("facts.start_date"), value: placeholderRuns("position.start_date") },
    {
      id: "annual_salary",
      label: phrase("facts.annual_salary"),
      value: pay ? phraseRuns(phrase("facts.annual_salary_value"), { amount: placeholderRuns("pay.annual_amount") }) : placeholderRuns("pay.annual_amount"),
      short: placeholderRuns("pay.annual_amount"),
    },
    { id: "reply_by", label: phrase("facts.reply_by"), value: placeholderRuns("acceptance.reply_by") },
  ];
  if (visible.some((section) => section.key === "leave") && !isEmptyValue(values["leave.days"])) {
    keyFacts.push({ id: "holiday", label: phrase("facts.holiday"), value: phraseRuns(phrase("facts.holiday_value"), { days: placeholderRuns("leave.days") }) });
  }

  const unreviewed = visible.some((section) => context.clauses[section.key]?.reviewStatus !== "approved");

  return {
    paperSize: jurisdiction.paperSize,
    templateKey: template?.key ?? state.templateKey,
    accent,
    tint: tintOf(accent, 0.09),
    company: {
      legalName: company.legalName,
      displayName: company.tradingName || company.legalName,
      brand: brandName(company.legalName, company.tradingName),
      wordmark: brandName(company.legalName, company.tradingName).toUpperCase(),
      addressLines: splitAddress(company.registeredAddress),
      registration: company.registrationNumber,
      website: company.website?.replace(/^https?:\/\//, "").replace(/\/$/, "") ?? null,
      phone: company.contactPhone,
      email: company.contactEmail,
      countryName: company.countryName,
      logo: company.logo,
    },
    recipient: {
      name: candidateName,
      // The address is optional and sits outside any clause, so it's simply left out when empty.
      addressLines: isEmptyValue(values["candidate.address"]) ? [] : splitAddress(String(values["candidate.address"])),
    },
    date,
    dateLine: phraseRuns(phrase("date_line") || "{{date}}", { place, date }),
    place,
    title: { label: titleLabel, subject: placeholderRuns("position.job_title") },
    opening: sectionBlocks("candidate"),
    sections: bodySections,
    closing: sectionBlocks("acceptance"),
    signatures: {
      company: {
        heading: phraseText(phrase("signature.company_heading"), { company: company.legalName }),
        note: phrase("signature.company_note"),
        name: placeholderRuns("signatory.name"),
        title: placeholderRuns("signatory.title"),
        place,
      },
      candidate: { heading: phrase("signature.candidate_heading"), note: phrase("signature.candidate_note"), name: candidateName },
      placeLabel: phrase("signature.place"),
      dateLabel: phrase("signature.date"),
    },
    keyFacts,
    runningHeader: [{ kind: "text", text: `${titleLabel} · ` }, ...candidateName],
    feeLine: phraseText(phrase("fee_line") || "{{company}} never charges candidates fees.", { company: company.legalName }),
    addressedTo: phraseRuns(phrase("addressed_to"), { candidate: candidateName, date }),
    phrases,
    unreviewed,
  };
}
