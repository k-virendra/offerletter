// Formatting for letter values, by the jurisdiction's locale and currency. Dates are stored as YYYY-MM-DD and
// formatted without time zones, so a start date never shifts by a day.

export function parseIsoDate(value: string): Date | null {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return null;
  const date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return date.getUTCMonth() === Number(match[2]) - 1 ? date : null;
}

export function formatDate(value: string, locale: string): string {
  const date = parseIsoDate(value);
  if (!date) return value;
  return new Intl.DateTimeFormat(locale, { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(date);
}

export function todayIso(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

/** "17 October 2026" for a moment in time, on the same (UTC) calendar as todayIso and letter dates. */
export function formatDay(value: string | Date): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(value));
}

/** "78000", "78,000" and "78 000.50" all read as numbers; anything else is null. */
export function parseAmount(value: string): number | null {
  const cleaned = value.trim().replace(/[\s, ]/g, "");
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) return null;
  return Number(cleaned);
}

/**
 * Money in the letter's currency. In running text whole amounts drop the decimals ("€78,000"); in tables, and
 * whenever there are cents, two decimals are shown ("€6,500.00").
 */
export function formatMoney(amount: number, currency: string, locale: string, exact = false): string {
  const whole = Number.isInteger(amount);
  const digits = exact || !whole ? 2 : 0;
  return new Intl.NumberFormat(locale, { style: "currency", currency, minimumFractionDigits: digits, maximumFractionDigits: digits }).format(amount);
}

export function formatNumber(value: number, locale: string): string {
  return new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value);
}

export const PAYMENTS_PER_YEAR: Record<string, number> = { monthly: 12, semi_monthly: 24, bi_weekly: 26, weekly: 52 };

export type PayFigures = { annual: number; instalments: number; perInstalment: number };

/** Annual pay from a yearly or monthly amount, and what each payment comes to. */
export function payFigures(baseAmount: number | null, period: string, frequency: string): PayFigures | null {
  if (baseAmount === null || baseAmount <= 0) return null;
  const annual = period === "month" ? baseAmount * 12 : baseAmount;
  const instalments = PAYMENTS_PER_YEAR[frequency] ?? 12;
  return { annual, instalments, perInstalment: Math.round((annual / instalments) * 100) / 100 };
}
