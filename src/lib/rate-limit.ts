import "server-only";
import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { adminClient } from "@/lib/supabase/admin";

/** A stable, non-reversible key for the visitor's IP address (raw IPs are never stored). */
export async function clientKey(): Promise<string> {
  const h = await headers();
  const ip = h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || "unknown";
  return createHash("sha256").update(ip).digest("hex").slice(0, 32);
}

/**
 * Counts one hit against `key` in a fixed window and says whether it is still allowed.
 * If the limiter itself fails, the request is allowed and the error logged: a broken limiter should not lock
 * everyone out of signing in.
 */
export async function takeRateLimit(key: string, windowSeconds: number, max: number): Promise<boolean> {
  const { data, error } = await adminClient().rpc("rate_limit_take", { p_key: key, p_window_seconds: windowSeconds, p_max: max });
  if (error) {
    console.error("rate limiter unavailable", error.message);
    return true;
  }
  return data === true;
}
