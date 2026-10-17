import { createHash, timingSafeEqual } from "node:crypto";

// PayU hash formulas (https://docs.payu.in/docs/hash-generation), from Askora, where they match the integration
// Elite Lease Living runs live. Pure functions: the salt is passed in and never leaves the server.
// Before go-live, add PayU's published sample vectors to the tests.

const sha512 = (input: string) => createHash("sha512").update(input, "utf8").digest("hex");

export interface PayuRequestFields {
  key: string;
  txnid: string;
  amount: string;
  productinfo: string;
  firstname: string;
  email: string;
  udf1?: string;
  udf2?: string;
  udf3?: string;
  udf4?: string;
  udf5?: string;
}

/** Request hash: sha512(key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5||||||SALT). */
export function payuRequestHash(fields: PayuRequestFields, salt: string): string {
  return sha512(
    [
      fields.key,
      fields.txnid,
      fields.amount,
      fields.productinfo,
      fields.firstname,
      fields.email,
      fields.udf1 ?? "",
      fields.udf2 ?? "",
      fields.udf3 ?? "",
      fields.udf4 ?? "",
      fields.udf5 ?? "",
      "",
      "",
      "",
      "",
      "",
      salt,
    ].join("|"),
  );
}

/**
 * Reverse (response) hash:
 * sha512([additional_charges|]SALT|status||||||udf5|udf4|udf3|udf2|udf1|email|firstname|productinfo|amount|txnid|key)
 */
export function payuResponseHash(response: Record<string, string | undefined>, salt: string, amount = response.amount ?? ""): string {
  const v = (k: string) => response[k] ?? "";
  const base = [salt, v("status"), "", "", "", "", "", v("udf5"), v("udf4"), v("udf3"), v("udf2"), v("udf1"), v("email"), v("firstname"), v("productinfo"), amount, v("txnid"), v("key")].join("|");
  const charges = response.additional_charges;
  return sha512(charges ? `${charges}|${base}` : base);
}

/**
 * Checks PayU's signature on a response. PayU echoes the amount as "799", "799.0" or "799.00" depending on the
 * payment mode, so each form is tried. Never enough on its own: payments are confirmed only by verify_payment.
 */
export function verifyPayuResponse(response: Record<string, string | undefined>, salt: string): boolean {
  const received = response.hash;
  if (!received) return false;
  const raw = response.amount ?? "";
  const value = Number(raw);
  const amounts = new Set([raw, ...(raw && Number.isFinite(value) ? [value.toFixed(2), value.toFixed(1), String(Math.round(value))] : [])]);
  let ok = false;
  for (const amount of amounts) ok = hashesMatch(payuResponseHash(response, salt, amount), received) || ok;
  return ok;
}

/** Merchant API command hash: sha512(key|command|var1|SALT). */
export function payuCommandHash(key: string, command: string, var1: string, salt: string): string {
  return sha512(`${key}|${command}|${var1}|${salt}`);
}

export function hashesMatch(expected: string, received: string | undefined): boolean {
  if (!received) return false;
  const a = Buffer.from(expected.toLowerCase(), "utf8");
  const b = Buffer.from(received.toLowerCase(), "utf8");
  return a.length === b.length && timingSafeEqual(a, b);
}
