import { randomInt } from "node:crypto";
import { payuRequestHash } from "./hash";

// The `_payment` form fields for PayU hosted checkout, shared by the real gateway and the local simulator so both
// receive identical data.

/** PayU hashes are pipe-delimited, so text sent to PayU must never contain "|" (or control characters). */
export function payuSafe(value: string, max: number): string {
  return value
    .replace(/[|\p{Cc}]/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** 79900 → "799.00": PayU takes amounts in major units with two decimals. */
export function amountString(minor: number): string {
  if (!Number.isInteger(minor) || minor <= 0) throw new Error("Amounts are positive whole minor units");
  return (minor / 100).toFixed(2);
}

/** "799", "799.0" or "799.00" → 79900; anything else → null. */
export function amountMinor(value: string | null | undefined): number | null {
  if (!value || !/^\d+(\.\d{1,2})?$/.test(value.trim())) return null;
  return Math.round(Number(value.trim()) * 100);
}

const REFERENCE_ALPHABET = "23456789ABCDEFGHJKMNPQRSTUVWXYZ"; // no 0/O, 1/I/L: people read these out to support

/** A transaction id people can quote: OLP-20261017-7Q4K2M (19 characters; PayU allows up to 25). */
export function newTxnid(now = new Date()): string {
  const day = now.toISOString().slice(0, 10).replaceAll("-", "");
  const suffix = Array.from({ length: 6 }, () => REFERENCE_ALPHABET[randomInt(REFERENCE_ALPHABET.length)]).join("");
  return `OLP-${day}-${suffix}`;
}

export type CheckoutFieldsInput = {
  key: string;
  salt: string;
  txnid: string;
  amountMinor: number;
  productinfo: string;
  firstname: string;
  email: string;
  phone?: string;
  /** Where PayU posts the customer back after paying (both outcomes). */
  returnUrl: string;
  letterId: string;
  userId: string;
};

export function buildPayuFields(input: CheckoutFieldsInput): Record<string, string> {
  const base = {
    key: input.key,
    txnid: input.txnid,
    amount: amountString(input.amountMinor),
    productinfo: payuSafe(input.productinfo, 100),
    firstname: payuSafe(input.firstname, 60),
    email: input.email.trim(),
    udf1: input.letterId,
    udf2: input.userId,
  };
  return {
    ...base,
    phone: (input.phone ?? "").replace(/[^\d+]/g, "").slice(0, 15),
    surl: input.returnUrl,
    furl: input.returnUrl,
    hash: payuRequestHash(base, input.salt),
  };
}

// PayU's response has card details (masked number, name on card, card hash). Only these fields are ever stored.
const KEPT_FIELDS = [
  "mihpayid",
  "mode",
  "status",
  "unmappedstatus",
  "txnid",
  "amount",
  "net_amount_debit",
  "additional_charges",
  "addedon",
  "productinfo",
  "udf1",
  "udf2",
  "error",
  "error_Message",
  "field9",
  "PG_TYPE",
  "bank_ref_num",
  "bankcode",
  "payment_source",
  "event",
  "source",
] as const;

/** The parts of a PayU response that are safe to log: never card data, never the hash or our key. */
export function loggableResponse(fields: Record<string, string>, source: string): Record<string, string> {
  const kept: Record<string, string> = { received_from: source, received_at: new Date().toISOString() };
  for (const name of KEPT_FIELDS) {
    const value = fields[name];
    if (typeof value === "string" && value) kept[name] = value.slice(0, 500);
  }
  return kept;
}

/** The fields of a form (or JSON) POST from PayU or the simulator, as strings, each cut to a sane length. */
export async function readPostedFields(request: Request): Promise<Record<string, string>> {
  const fields: Record<string, string> = {};
  if ((request.headers.get("content-type") ?? "").includes("application/json")) {
    const body = (await request.json().catch(() => null)) as Record<string, unknown> | null;
    for (const [name, value] of Object.entries(body ?? {})) {
      if (typeof value === "string" || typeof value === "number") fields[name] = String(value).slice(0, 4_000);
    }
    return fields;
  }
  const form = await request.formData().catch(() => null);
  if (form) for (const [name, value] of form) if (typeof value === "string") fields[name] = value.slice(0, 4_000);
  return fields;
}
