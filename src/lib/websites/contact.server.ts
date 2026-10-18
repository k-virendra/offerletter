import "server-only";
import { adminClient } from "@/lib/supabase/admin";

export type Contact = { to: string; name: string; business: string };

/** Who to email about a website: the billing contact, else the account's email. */
export async function subscriptionContact(subscriptionId: string): Promise<Contact | null> {
  const { data } = await adminClient().from("subscriptions").select("billing, companies(legal_name), profiles(email)").eq("id", subscriptionId).maybeSingle();
  if (!data) return null;
  const billing = data.billing as { fullName?: string; email?: string };
  const to = billing.email ?? data.profiles?.email;
  return to ? { to, name: billing.fullName || "there", business: data.companies?.legal_name ?? "your business" } : null;
}
