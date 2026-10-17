import "server-only";
import { formatMoney } from "@/lib/payments/prices.server";
import { createClient } from "@/lib/supabase/server";

// Reads for the admin pages, with the admin's own session (the RLS policies let admins read everything).

export type CountryRow = {
  code: string;
  parentCode: string | null;
  name: string;
  /** "United States, New York" for states and provinces. */
  label: string;
  currency: string;
  paperSize: "a4" | "letter";
  enabled: boolean;
  selectable: boolean;
  publicNote: string | null;
  adminNotes: string | null;
  required: number;
  /** Required sections without an approved English clause in the country or a parent: why it can't go live. */
  missing: string[];
  /** Required sections whose approved clause comes from a parent (US-NY inherits US). */
  inherited: number;
};

/** Every country with what it still needs before it can be switched on (the same rule as the database guard). */
export async function countryReadiness(): Promise<CountryRow[]> {
  const supabase = await createClient();
  const [jurisdictions, sections, clauses] = await Promise.all([
    supabase.from("jurisdictions").select("code, parent_code, name, currency, paper_size, enabled, selectable, sort_order, public_note, admin_notes").order("sort_order"),
    supabase.from("sections").select("key, default_title, always_included, default_order").order("default_order"),
    supabase.from("clause_variants").select("section_key, jurisdiction_code, review_status, locked").eq("language", "en"),
  ]);
  if (jurisdictions.error || sections.error || clauses.error) throw new Error("Countries couldn't be loaded");
  const byCode = new Map(jurisdictions.data.map((j) => [j.code, j]));
  const chainOf = (code: string) => {
    const chain: string[] = [];
    for (let current = byCode.get(code); current && chain.length < 5; current = current.parent_code ? byCode.get(current.parent_code) : undefined) chain.push(current.code);
    return chain;
  };

  return jurisdictions.data.map((j) => {
    const chain = chainOf(j.code);
    const inChain = clauses.data.filter((c) => chain.includes(c.jurisdiction_code));
    const required = sections.data.filter((s) => s.always_included || inChain.some((c) => c.section_key === s.key && c.locked));
    const approved = (key: string, codes: string[]) => inChain.some((c) => c.section_key === key && c.review_status === "approved" && codes.includes(c.jurisdiction_code));
    const parent = j.parent_code ? byCode.get(j.parent_code) : undefined;
    return {
      code: j.code,
      parentCode: j.parent_code,
      name: j.name,
      label: parent ? `${parent.name}, ${j.name}` : j.name,
      currency: j.currency,
      paperSize: j.paper_size,
      enabled: j.enabled,
      selectable: j.selectable,
      publicNote: j.public_note,
      adminNotes: j.admin_notes,
      required: required.length,
      missing: required.filter((s) => !approved(s.key, chain)).map((s) => s.default_title),
      inherited: required.filter((s) => !approved(s.key, [j.code]) && approved(s.key, chain.slice(1))).length,
    };
  });
}

export type Period = { key: string; label: string; from: Date; to: Date; previousFrom: Date };

/** Calendar months in UTC, "2026-10"; the current month when the key is missing or malformed. */
export function monthPeriod(key: string | undefined, now = new Date()): Period {
  const match = key?.match(/^(\d{4})-(0[1-9]|1[0-2])$/);
  const year = match ? Number(match[1]) : now.getUTCFullYear();
  const month = match ? Number(match[2]) - 1 : now.getUTCMonth();
  const from = new Date(Date.UTC(year, month, 1));
  return {
    key: `${year}-${String(month + 1).padStart(2, "0")}`,
    label: new Intl.DateTimeFormat("en-GB", { month: "long", year: "numeric", timeZone: "UTC" }).format(from),
    from,
    to: new Date(Date.UTC(year, month + 1, 1)),
    previousFrom: new Date(Date.UTC(year, month - 1, 1)),
  };
}

/** This month and the eleven before it, newest first, for the period picker. */
export function recentMonths(now = new Date()): Period[] {
  return Array.from({ length: 12 }, (_, i) => monthPeriod(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1)).toISOString().slice(0, 7), now));
}

type MoneyByCurrency = Record<string, number>;
type RawMetrics = {
  letters_paid: number;
  letters_paid_before: number;
  revenue: MoneyByCurrency;
  refunds: Record<string, { count: number; total: number }>;
  letters_started: number;
  letters_started_paid: number;
  checkouts: number;
  checkouts_paid: number;
  pending: number;
};

export type Metrics = {
  lettersPaid: number;
  /** Change on the previous period, in whole percent; null when there's nothing to compare with. */
  lettersPaidChange: number | null;
  revenue: string;
  refunds: { count: number; total: string };
  draftToPaid: number | null;
  checkoutToPaid: number | null;
  pending: number;
};

const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : null);
const money = (amounts: MoneyByCurrency) => {
  const entries = Object.entries(amounts).filter(([, total]) => total > 0);
  return entries.length ? entries.map(([currency, total]) => formatMoney({ currency, amountMinor: total })).join(" + ") : formatMoney({ currency: "INR", amountMinor: 0 });
};

export async function periodMetrics(period: Period): Promise<Metrics> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("admin_metrics", { p_from: period.from.toISOString(), p_to: period.to.toISOString(), p_prev_from: period.previousFrom.toISOString() });
  if (error || !data) throw new Error(`Metrics couldn't be loaded: ${error?.message}`);
  const m = data as unknown as RawMetrics;
  const refunds = Object.entries(m.refunds);
  return {
    lettersPaid: m.letters_paid,
    lettersPaidChange: m.letters_paid_before > 0 ? Math.round(((m.letters_paid - m.letters_paid_before) / m.letters_paid_before) * 100) : null,
    revenue: money(m.revenue),
    refunds: { count: refunds.reduce((sum, [, r]) => sum + r.count, 0), total: money(Object.fromEntries(refunds.map(([currency, r]) => [currency, r.total]))) },
    draftToPaid: percent(m.letters_started_paid, m.letters_started),
    checkoutToPaid: percent(m.checkouts_paid, m.checkouts),
    pending: m.pending,
  };
}

/** Minutes until the next quarter hour, when the payment recheck runs (vercel.json). */
export function minutesToNextRecheck(now = new Date()): number {
  return 15 - (now.getUTCMinutes() % 15);
}

export const PAYMENT_LABELS = {
  initiated: { text: "Started", tone: "neutral" },
  pending: { text: "Pending", tone: "info" },
  success: { text: "Success · verified", tone: "success" },
  failed: { text: "Failed", tone: "danger" },
  refunded: { text: "Refunded", tone: "warning" },
} as const;

/** "9 min", "3 h", "2 days": how long a payment has been waiting. */
export function age(iso: string, now = new Date()): string {
  const minutes = Math.max(0, Math.round((now.getTime() - new Date(iso).getTime()) / 60_000));
  if (minutes < 60) return `${minutes} min`;
  if (minutes < 48 * 60) return `${Math.round(minutes / 60)} h`;
  return `${Math.round(minutes / 1440)} days`;
}

/** "16 Oct, 08:20" in UTC, for logs and lists. */
export function shortDateTime(iso: string): string {
  return new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "UTC" }).format(new Date(iso));
}
