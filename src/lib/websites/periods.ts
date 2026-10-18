// Billing dates for website subscriptions, as calendar days ("YYYY-MM-DD", UTC like todayIso). The database issues
// monthly invoices with the same rules (issue_monthly_invoices, mark_overdue_subscriptions); this module is for
// the onboarding invoice and for showing dates.

/** Monthly invoices are issued this many days before the 1st they're due on. */
export const ISSUE_DAYS_BEFORE = 5;
/** An invoice unpaid this many days after its due date makes the subscription past due. */
export const GRACE_DAYS = 7;

const parse = (day: string) => {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
};
const format = (date: Date) => date.toISOString().slice(0, 10);

export function addDays(day: string, days: number): string {
  const date = parse(day);
  date.setUTCDate(date.getUTCDate() + days);
  return format(date);
}

export function monthEnd(day: string): string {
  const date = parse(day);
  return format(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 0)));
}

/** The onboarding payment covers the day it's paid to the end of that month; monthly billing starts on the 1st. */
export function onboardingPeriod(paidOn: string): { start: string; end: string } {
  return { start: paidOn, end: monthEnd(paidOn) };
}

/** The next payment is due the day after the paid-for period ends (always a 1st). */
export function nextDueDate(paidThrough: string | null): string | null {
  return paidThrough ? addDays(paidThrough, 1) : null;
}

export function isOverdue(dueOn: string, today: string): boolean {
  return today >= addDays(dueOn, GRACE_DAYS);
}

/** "November 2026". */
export function monthLabel(day: string): string {
  return new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(parse(day));
}
