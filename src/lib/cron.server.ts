import "server-only";
import { timingSafeEqual } from "node:crypto";
import { serverEnv } from "@/lib/env.server";

/** Scheduled jobs: Vercel sends "Authorization: Bearer <CRON_SECRET>". No secret configured means no access. */
export function cronAuthorised(request: Request): boolean {
  const secret = serverEnv().CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}
