import { createClient } from "@supabase/supabase-js";
import type { Database } from "../src/lib/supabase/database.types";

// Every run sends several sign-in emails from the same address, which the app's own limit (10 per IP per
// 10 minutes) would soon block. Start each run with fresh counters, and only ever on the local stack.
export default async function globalSetup() {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    // CI sets the variables directly.
  }
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const secretKey = process.env.SUPABASE_SECRET_KEY;
  if (!/^http:\/\/(127\.0\.0\.1|localhost):\d+$/.test(url)) {
    throw new Error(`End-to-end tests run only against the local Supabase stack, not "${url}"`);
  }
  if (!secretKey) throw new Error("SUPABASE_SECRET_KEY is missing; run `supabase status` and copy it into .env.local");

  const admin = createClient<Database>(url, secretKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { error } = await admin.from("rate_limits").delete().gte("hits", 0);
  if (error) throw new Error(`Couldn't reset rate limits: ${error.message}`);
}
