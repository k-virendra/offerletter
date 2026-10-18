import "server-only";
import { formatMoney } from "@/lib/payments/prices.server";
import { adminClient } from "@/lib/supabase/admin";
import { createClient } from "@/lib/supabase/server";
import type { Database } from "@/lib/supabase/database.types";

// Reads for the customer's website pages. Filtered by the signed-in user as well as by RLS, because an admin's
// session can read every subscription.

export type SubscriptionStatus = Database["public"]["Enums"]["subscription_status"];
export type Plan = { id: string; key: string; name: string; description: string | null; currency: string; onboardingMinor: number; monthlyMinor: number; domainAllowanceMinor: number; features: string[] };

export async function activePlan(): Promise<Plan | null> {
  const { data } = await adminClient().from("plans").select("id, key, name, description, currency, onboarding_minor, monthly_minor, domain_allowance_minor, features").eq("active", true).order("sort_order").limit(1).maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    key: data.key,
    name: data.name,
    description: data.description,
    currency: data.currency,
    onboardingMinor: data.onboarding_minor,
    monthlyMinor: data.monthly_minor,
    domainAllowanceMinor: data.domain_allowance_minor,
    features: Array.isArray(data.features) ? (data.features as string[]) : [],
  };
}

export const planMoney = (plan: Plan, amountMinor: number) => formatMoney({ currency: plan.currency, amountMinor });

const LIST = "id, status, domain, requested_domains, website_url, paid_through, created_at, cancel_requested_at, companies(legal_name), plans(name, monthly_minor, currency)";

export async function ownSubscriptions(userId: string) {
  const supabase = await createClient();
  const { data } = await supabase.from("subscriptions").select(LIST).eq("user_id", userId).order("created_at", { ascending: false });
  return data ?? [];
}

const DETAIL =
  "id, status, company_id, requested_domains, mailbox_name, brief, billing, contact_phone, domain, domain_expires_on, website_url, mailbox_address, mailbox_provider, domain_ready_at, website_ready_at, mailbox_ready_at, activated_at, paid_through, status_reason, cancel_requested_at, created_at, companies(legal_name), plans(name, monthly_minor, currency)";

export async function ownSubscription(userId: string, id: string) {
  const supabase = await createClient();
  const { data: subscription } = await supabase.from("subscriptions").select(DETAIL).eq("id", id).eq("user_id", userId).maybeSingle();
  if (!subscription) return null;
  const [{ data: invoices }, { data: events }] = await Promise.all([
    supabase
      .from("invoices")
      .select("id, number, kind, description, amount_minor, currency, period_start, period_end, due_on, status, paid_at, payments!invoices_payment_id_fkey(txnid)")
      .eq("subscription_id", id)
      .eq("user_id", userId)
      .order("due_on", { ascending: false }),
    supabase.from("subscription_events").select("id, kind, message, created_at").eq("subscription_id", id).eq("visible_to_customer", true).order("created_at", { ascending: false }).limit(50),
  ]);
  return { subscription, invoices: invoices ?? [], events: events ?? [] };
}

export const SUBSCRIPTION_LABELS: Record<SubscriptionStatus, { text: string; tone: "neutral" | "info" | "success" | "warning" | "danger" }> = {
  pending_payment: { text: "Waiting for payment", tone: "neutral" },
  onboarding: { text: "Being set up", tone: "info" },
  active: { text: "Active", tone: "success" },
  past_due: { text: "Payment overdue", tone: "warning" },
  suspended: { text: "Suspended", tone: "danger" },
  cancelled: { text: "Cancelled", tone: "neutral" },
};
