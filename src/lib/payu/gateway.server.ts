import "server-only";
import { publicEnv } from "@/lib/env";
import { isLocalStack, serverEnv } from "@/lib/env.server";
import { payuCommandHash, verifyPayuResponse } from "./hash";
import { simulatorVerify } from "./simulator";
import { parseVerifyResponse, type Verification } from "./verify";

// PayU hosted checkout. Three modes: the local simulator (refused unless the app talks to a local Supabase), PayU's
// test environment and live. The key and salt stay on the server; verify_payment is the only proof of payment.

const ENDPOINTS = {
  test: { checkout: "https://test.payu.in/_payment", api: "https://test.payu.in/merchant/postservice.php?form=2" },
  live: { checkout: "https://secure.payu.in/_payment", api: "https://info.payu.in/merchant/postservice.php?form=2" },
} as const;

// The simulator's own credentials; they mean nothing outside this machine.
const SIMULATOR = { key: "olpsimkey", salt: "olp-simulator-salt-not-a-secret" };

export type PayuConfig = { mode: "simulator" | "test" | "live"; key: string; salt: string; checkoutUrl: string };

export class PayuConfigError extends Error {
  override name = "PayuConfigError";
}

export function payuConfig(): PayuConfig {
  const env = serverEnv();
  const mode = env.PAYU_MODE ?? (isLocalStack() ? "simulator" : undefined);
  if (!mode) throw new PayuConfigError("Set PAYU_MODE (test or live) with PAYU_MERCHANT_KEY and PAYU_MERCHANT_SALT");
  if (mode === "simulator") {
    if (!isLocalStack()) throw new PayuConfigError("The PayU simulator only runs against a local Supabase stack");
    return { mode, ...SIMULATOR, checkoutUrl: `${appUrl()}/api/dev/payu` };
  }
  if (!env.PAYU_MERCHANT_KEY || !env.PAYU_MERCHANT_SALT) throw new PayuConfigError("PAYU_MERCHANT_KEY and PAYU_MERCHANT_SALT are required");
  return { mode, key: env.PAYU_MERCHANT_KEY, salt: env.PAYU_MERCHANT_SALT, checkoutUrl: ENDPOINTS[mode].checkout };
}

export function appUrl(): string {
  return publicEnv.NEXT_PUBLIC_APP_URL.replace(/\/$/, "");
}

/** Checks that a browser- or webhook-delivered response was signed by PayU for our merchant key. */
export function isGenuineResponse(fields: Record<string, string>): boolean {
  const { key, salt } = payuConfig();
  return fields.key === key && verifyPayuResponse(fields, salt);
}

/** Server-to-server status check with PayU: the only thing allowed to mark a payment as paid. */
export async function verifyPayment(txnid: string, fetcher: typeof fetch = fetch): Promise<Verification> {
  const config = payuConfig();
  if (config.mode === "simulator") return simulatorVerify(txnid);

  const body = new URLSearchParams({ key: config.key, command: "verify_payment", var1: txnid, hash: payuCommandHash(config.key, "verify_payment", txnid, config.salt) });
  const response = await fetcher(ENDPOINTS[config.mode].api, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body: body.toString(),
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error(`PayU verify_payment: HTTP ${response.status}`);
  return parseVerifyResponse(await response.json().catch(() => null), txnid);
}
