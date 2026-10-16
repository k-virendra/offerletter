import "server-only";
import { createClient } from "@supabase/supabase-js";
import { publicEnv } from "@/lib/env";
import { serverEnv } from "@/lib/env.server";
import type { Database } from "./database.types";

let client: ReturnType<typeof createClient<Database>> | undefined;

/**
 * A Supabase client with the secret key. It bypasses Row Level Security, so use it only after checking on the
 * server that the current user is allowed to do the thing (payments, issuing, admin actions, rate limits).
 */
export function adminClient() {
  client ??= createClient<Database>(publicEnv.NEXT_PUBLIC_SUPABASE_URL, serverEnv().SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  return client;
}
