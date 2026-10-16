import "server-only";
import { redirect } from "next/navigation";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

// The data access layer for "who is this?". Pages and actions call these, never trusting the proxy alone.

/** The signed-in user, verified with Supabase Auth, or null. Cached for one request. */
export const getUser = cache(async () => {
  const supabase = await createClient();
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user;
});

/** The signed-in user, or a redirect to sign-in. */
export async function requireUser(next?: string) {
  const user = await getUser();
  if (!user) redirect(next ? `/sign-in?next=${encodeURIComponent(next)}` : "/sign-in");
  return user;
}

export const getProfile = cache(async () => {
  const user = await getUser();
  if (!user) return null;
  const supabase = await createClient();
  const { data } = await supabase.from("profiles").select("id, email, full_name, role, company_limit").eq("id", user.id).single();
  return data;
});

/** Admin pages and actions: the role is read from the database on every request. */
export async function requireAdmin() {
  const user = await requireUser("/admin");
  const profile = await getProfile();
  if (profile?.role !== "admin") redirect("/dashboard");
  return { user, profile };
}
