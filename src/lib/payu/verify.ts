import { amountMinor } from "./fields";

// PayU's verify_payment answer, read into what the payment code needs. Pure, so it can be tested with PayU's
// documented response shapes.

export type Verification = {
  status: "success" | "failure" | "pending" | "not_found";
  amountMinor: number | null;
  mihpayid: string | null;
  mode: string | null;
  errorMessage: string | null;
  raw: Record<string, string>;
};

/** verify_payment's status words → ours. Anything PayU doesn't call final stays pending (the recheck asks again). */
export function mapPaymentStatus(raw: string | null | undefined): Verification["status"] {
  switch ((raw ?? "").trim().toLowerCase()) {
    case "success":
      return "success";
    case "failure":
    case "failed":
    case "dropped":
    case "bounced":
    case "usercancelled":
      return "failure";
    case "not found":
      return "not_found";
    default:
      return "pending";
  }
}

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : typeof value === "number" ? String(value) : null);

const KEPT = ["status", "unmappedstatus", "mihpayid", "mode", "amt", "transaction_amount", "error_code", "error_Message", "field9", "addedon"];

/** Reads `{ transaction_details: { [txnid]: {...} } }`. Throws when PayU's answer has no details for the txnid. */
export function parseVerifyResponse(data: unknown, txnid: string): Verification {
  const details = (data as { transaction_details?: Record<string, Record<string, unknown>> } | null)?.transaction_details?.[txnid];
  if (!details) throw new Error("PayU verify_payment: no details for this transaction");

  const raw: Record<string, string> = {};
  for (const key of KEPT) {
    const value = text(details[key]);
    if (value) raw[key] = value.slice(0, 300);
  }
  const mihpayid = text(details.mihpayid);
  return {
    status: mapPaymentStatus(text(details.status)),
    amountMinor: amountMinor(text(details.amt) ?? text(details.transaction_amount)),
    mihpayid: mihpayid && mihpayid.toLowerCase() !== "not found" ? mihpayid : null,
    mode: text(details.mode),
    errorMessage: text(details.error_Message) ?? text(details.field9),
    raw,
  };
}
