import "server-only";
import { getProfile, getUser } from "@/lib/auth";
import { adminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";

// Admin server actions. The admin role is read from the database on every call (never trusted from the page),
// and writes go through the admin's own session where a policy allows it, so the audit log names who did what.

export type AdminActor = { id: string; email: string | null };
export type AdminResult = { ok: true; message?: string } | { ok: false; message: string };

export const NOT_ADMIN: AdminResult = { ok: false, message: "Only admins can do this. Sign in again with an admin account." };

export async function adminActor(): Promise<AdminActor | null> {
  const user = await getUser();
  if (!user) return null;
  const profile = await getProfile();
  return profile?.role === "admin" ? { id: profile.id, email: profile.email } : null;
}

/** For changes made with the secret key (payments): the audit trigger can't see who asked, so say it here. */
export async function auditAs(actor: AdminActor, action: string, entityType: string, entityId: string, details: Record<string, unknown> = {}) {
  const { error } = await adminClient()
    .from("audit_logs")
    .insert({ actor_id: actor.id, action, entity_type: entityType, entity_id: entityId, details: details as Json });
  if (error) console.error("audit log failed", error.message);
}
