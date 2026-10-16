import { parseAmount, parseIsoDate } from "@/lib/template/format";
import type { FieldDefinition, FieldValue, FieldValues, LetterContext, LetterState, SectionDefinition } from "./types";

// Rules for the values typed into a letter, shared by the editor and the server. Drafts may be incomplete:
// empty required fields are listed (they block payment), and invalid values get a message next to the field.

export const MAX_TEXT_LENGTH = 2000;

export function isEmptyValue(value: FieldValue | undefined): boolean {
  if (value === undefined || value === false) return true;
  return typeof value === "string" && value.trim() === "";
}

/** The problem with a filled-in value, in the design's wording. Empty values have none (see missingFields). */
export function fieldError(field: FieldDefinition, value: FieldValue | undefined, today: string): string | undefined {
  if (isEmptyValue(value) || typeof value !== "string") return undefined;
  const text = value.trim();
  const { min, max, max_length: maxLength, future } = field.validation;

  if (text.length > (maxLength ?? MAX_TEXT_LENGTH)) return `Keep this under ${maxLength ?? MAX_TEXT_LENGTH} characters`;

  switch (field.type) {
    case "email":
      return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(text) ? undefined : "Enter a full email address, like name@company.com";
    case "phone": {
      const digits = text.replace(/\D/g, "").length;
      return /^\+[\d\s().-]+$/.test(text) && digits >= 7 && digits <= 15
        ? undefined
        : "Enter a phone number with the country code, like +49 89 1234 5678";
    }
    case "date": {
      if (!parseIsoDate(text)) return "Enter a real date, like 01/12/2026";
      if (future && text <= today) return "Choose a date after today";
      return undefined;
    }
    case "money": {
      const amount = parseAmount(text);
      if (amount === null) return "Enter an amount in numbers, like 78000";
      if (min !== undefined && amount < min) return `Enter at least ${min}`;
      if (max !== undefined && amount > max) return `Enter no more than ${max}`;
      return undefined;
    }
    case "number": {
      const number = Number(text);
      if (!Number.isFinite(number) || !/^\d+(\.\d+)?$/.test(text)) return "Enter a number, like 40";
      if ((min !== undefined && number < min) || (max !== undefined && number > max)) {
        return `Enter a number from ${min ?? 0} to ${max}`;
      }
      return undefined;
    }
    case "select":
      return field.options.some((option) => option.value === text) ? undefined : "Choose one of the options";
    default:
      return undefined;
  }
}

const text = (values: FieldValues, key: string) => (typeof values[key] === "string" ? (values[key] as string).trim() : "");

function addMonths(date: Date, months: number): Date {
  const next = new Date(date);
  next.setUTCMonth(next.getUTCMonth() + months);
  return next;
}

/**
 * Rules that compare fields, some of them country law. Keyed by the field that shows the message.
 * `country` is the jurisdiction code (rules for a country also apply to its states and provinces).
 */
export function crossFieldErrors(values: FieldValues, country = ""): Record<string, string> {
  const errors: Record<string, string> = {};
  const startText = text(values, "position.start_date");
  const start = parseIsoDate(startText);
  const replyBy = text(values, "acceptance.reply_by");
  if (start && parseIsoDate(replyBy) && replyBy >= startText) {
    errors["acceptance.reply_by"] = "The reply-by date must be before the start date";
  }

  const fixedTerm = text(values, "position.contract_type") === "fixed_term";
  const endText = text(values, "position.end_date");
  const end = parseIsoDate(endText);
  if (fixedTerm && start && end && endText <= startText) {
    errors["position.end_date"] = "The end date must be after the start date";
  }

  // Netherlands, art. 7:652 BW: no probation in contracts of 6 months or less, at most 1 month below 2 years.
  if (country.startsWith("NL") && fixedTerm && start && end && endText > startText) {
    const probation = text(values, "probation.months");
    if (end <= addMonths(start, 6) && probation && probation !== "0") {
      errors["probation.months"] = "Fixed-term contracts of 6 months or less can’t have a probation period";
    } else if (end < addMonths(start, 24) && probation === "2") {
      errors["probation.months"] = "Fixed-term contracts shorter than 2 years allow at most 1 month of probation";
    }
  }

  // United Kingdom: 5.6 weeks' holiday, which may include bank holidays.
  if (country.startsWith("GB") && text(values, "leave.public_holidays") === "included") {
    const days = Number(text(values, "leave.days"));
    if (text(values, "leave.days") && Number.isFinite(days) && days < 28) {
      errors["leave.days"] = "With bank holidays included, the legal minimum is 28 days";
    }
  }
  return errors;
}

/**
 * Moves a draft to another jurisdiction: keeps every answer the new country still has a field for, replaces
 * choices that aren't offered there with its default, fills in its defaults, and puts back sections it requires.
 * Returns the keys of answers that were dropped.
 */
export function moveToJurisdiction(next: LetterContext, state: LetterState): { state: LetterState; dropped: string[] } {
  const fields = new Map(next.fields.map((field) => [field.key, field]));
  const values: FieldValues = {};
  const dropped: string[] = [];
  for (const [key, value] of Object.entries(state.values)) {
    if (value === undefined) continue;
    const field = fields.get(key);
    if (!field) {
      if (!isEmptyValue(value)) dropped.push(key);
      continue;
    }
    if (field.type === "select" && typeof value === "string" && value && !field.options.some((option) => option.value === value)) {
      if (field.defaultValue !== null) values[key] = field.defaultValue;
      else dropped.push(key);
      continue;
    }
    values[key] = value;
  }
  for (const field of next.fields) {
    if (values[field.key] === undefined && field.defaultValue !== null) values[field.key] = field.defaultValue;
  }
  const removedSections = state.removedSections.filter((key) => {
    const section = next.sections.find((s) => s.key === key);
    return section !== undefined && !sectionLock(next, section);
  });
  return { state: { ...state, values, removedSections }, dropped };
}

/** Sections in the letter: they have a clause for the jurisdiction and haven't been removed. */
export function letterSections(context: LetterContext, removed: string[]): SectionDefinition[] {
  return context.sections.filter((section) => context.clauses[section.key] && !removed.includes(section.key));
}

/** Sections the user may remove, with the reason when they can't. */
export function sectionLock(context: LetterContext, section: SectionDefinition): string | null {
  if (section.alwaysIncluded) return "Included in every letter";
  const clause = context.clauses[section.key];
  return clause?.locked ? (clause.lockedReason ?? `Required in ${context.jurisdiction.countryName}`) : null;
}

/** Required fields still empty, in letter order. Fields in removed sections don't count. */
export function missingFields(context: LetterContext, state: Pick<LetterState, "values" | "removedSections">): FieldDefinition[] {
  const order = new Map(letterSections(context, state.removedSections).map((section, index) => [section.key, index]));
  return context.fields
    .filter((field) => field.required && order.has(field.sectionKey) && isEmptyValue(state.values[field.key]))
    .sort((a, b) => order.get(a.sectionKey)! - order.get(b.sectionKey)! || a.sortOrder - b.sortOrder);
}

/** Every problem that blocks payment: empty required fields and invalid values, in letter order. */
export function blockingProblems(context: LetterContext, state: LetterState, today: string) {
  const sections = new Set(letterSections(context, state.removedSections).map((section) => section.key));
  const cross = crossFieldErrors(state.values, context.jurisdiction.code);
  const invalid = context.fields.flatMap((field) => {
    if (!sections.has(field.sectionKey)) return [];
    const message = fieldError(field, state.values[field.key], today) ?? cross[field.key];
    return message ? [{ field, message }] : [];
  });
  return { missing: missingFields(context, state), invalid };
}

/**
 * Cleans values sent by a browser: only known fields, strings or booleans of a sane size. Unknown keys are dropped
 * so a crafted request can't store arbitrary data on the letter.
 */
export function sanitizeValues(fields: { key: string; type: string }[], input: unknown): FieldValues {
  const out: FieldValues = {};
  if (!input || typeof input !== "object") return out;
  const known = new Map(fields.map((field) => [field.key, field.type]));
  for (const [key, value] of Object.entries(input as Record<string, unknown>)) {
    const type = known.get(key);
    if (!type) continue;
    if (type === "yes_no") {
      if (typeof value === "boolean") out[key] = value;
    } else if (typeof value === "string") {
      out[key] = value.slice(0, MAX_TEXT_LENGTH);
    }
  }
  return out;
}
