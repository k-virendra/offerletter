import "server-only";
import { randomInt } from "node:crypto";
import { amountMinor } from "./fields";
import { hashesMatch, payuRequestHash, payuResponseHash } from "./hash";
import type { Verification } from "./verify";
import { BRAND } from "@/lib/brand";

// A local stand-in for PayU hosted checkout (PAYU_MODE=simulator, local Supabase only), from Askora. It checks the
// merchant hash exactly as PayU would, posts a signed response back to surl/furl, sends PayU's server-to-server
// webhook a moment later, and answers verify_payment from its ledger, so the real verification path runs end to
// end without a PayU account. The ledger lives on globalThis: shared by every route in the server process.

export type SimulatorOutcome = "success" | "pending" | "failure" | "cancel";
type Order = { fields: Record<string, string>; outcome: SimulatorOutcome | null; mihpayid: string | null; decidedAt: number | null };

/** Pending payments in the simulator settle to success after this long. */
export const PENDING_SETTLES_MS = 10_000;

const store = globalThis as typeof globalThis & { __olpPayuSimulator?: Map<string, Order> };
const ledger = (store.__olpPayuSimulator ??= new Map<string, Order>());

const escape = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

function page(title: string, body: string, autoSubmit = false): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex">
<title>${escape(title)}</title>
<style>
  body{margin:0;font-family:ui-sans-serif,system-ui,-apple-system,"Segoe UI",sans-serif;background:#f1f4f9;color:#111827}
  .bar{background:#0d3b66;color:#fff;padding:14px 18px;font-weight:700;display:flex;justify-content:space-between;align-items:center}
  .bar small{font-weight:600;background:#f59e0b;color:#111;padding:3px 8px;border-radius:6px}
  main{max-width:420px;margin:0 auto;padding:18px}
  .card{background:#fff;border-radius:14px;padding:18px;box-shadow:0 1px 3px rgba(0,0,0,.08);margin-bottom:14px}
  .amt{font-size:30px;font-weight:800;margin:4px 0}
  .muted{color:#6b7280;font-size:14px}
  button{width:100%;min-height:52px;border:0;border-radius:12px;font:inherit;font-weight:700;font-size:16px;margin-top:10px;cursor:pointer}
  .ok{background:#16a34a;color:#fff}.pending{background:#2563eb;color:#fff}.fail{background:#dc2626;color:#fff}.cancel{background:#e5e7eb;color:#111}
  code{font-size:12px;word-break:break-all}
</style></head><body>${body}${autoSubmit ? "<script>document.forms[0].submit()</script>" : ""}</body></html>`;
  return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store", "x-robots-tag": "noindex" } });
}

/** Step 1, "hosted checkout": checks the merchant hash, then offers outcomes. */
export function simulatorCheckout(fields: Record<string, string>, credentials: { key: string; salt: string }, completeUrl: string): Response {
  const expected = payuRequestHash(
    {
      key: fields.key ?? "",
      txnid: fields.txnid ?? "",
      amount: fields.amount ?? "",
      productinfo: fields.productinfo ?? "",
      firstname: fields.firstname ?? "",
      email: fields.email ?? "",
      udf1: fields.udf1 ?? "",
      udf2: fields.udf2 ?? "",
    },
    credentials.salt,
  );
  const txnid = fields.txnid ?? "";
  if (fields.key !== credentials.key || !txnid || !hashesMatch(expected, fields.hash)) {
    return page("Payment error", `<div class="bar">PayU · test</div><main><div class="card"><b>Transaction rejected</b><p class="muted">Hash mismatch: the request wasn't signed by this merchant.</p></div></main>`);
  }
  if (!ledger.has(txnid)) ledger.set(txnid, { fields, outcome: null, mihpayid: null, decidedAt: null });
  const option = (outcome: SimulatorOutcome, label: string, cls: string) => `<button class="${cls}" name="outcome" value="${outcome}">${escape(label)}</button>`;
  return page(
    "PayU test checkout",
    `<div class="bar">PayU <small>TEST MODE · simulator</small></div><main>
  <div class="card"><div class="muted">Paying</div><div class="amt">₹${escape(fields.amount ?? "")}</div>
  <div class="muted">${escape(fields.productinfo ?? "")} · txn <code>${escape(txnid)}</code></div></div>
  <form method="post" action="${escape(completeUrl)}" class="card">
    <input type="hidden" name="txnid" value="${escape(txnid)}">
    <div class="muted">Choose what the gateway should report:</div>
    ${option("success", "Pay by card — success", "ok")}
    ${option("pending", "Bank transfer — pending (settles in ~10 s)", "pending")}
    ${option("failure", "Card declined — failure", "fail")}
    ${option("cancel", "Cancel payment", "cancel")}
  </form>
  <p class="muted">Simulator only. No money moves. Never available against a hosted database.</p></main>`,
  );
}

function responseFor(txnid: string, order: Order, key: string, salt: string): Record<string, string> {
  const f = order.fields;
  const status = order.outcome === "success" ? "success" : order.outcome === "pending" ? "pending" : "failure";
  const response: Record<string, string> = {
    mihpayid: order.mihpayid ?? "",
    mode: "CC",
    status,
    unmappedstatus: order.outcome === "cancel" ? "userCancelled" : status === "success" ? "captured" : status,
    key,
    txnid,
    amount: f.amount ?? "",
    productinfo: f.productinfo ?? "",
    firstname: f.firstname ?? "",
    email: f.email ?? "",
    udf1: f.udf1 ?? "",
    udf2: f.udf2 ?? "",
    // What a real response also carries; it must never be stored.
    cardnum: "512345XXXXXX2346",
    name_on_card: f.firstname ?? "",
    error: status === "failure" ? "E308" : "E000",
    error_Message: order.outcome === "failure" ? "Card declined by the issuing bank" : order.outcome === "cancel" ? "User cancelled" : "No Error",
  };
  response.hash = payuResponseHash(response, salt);
  return response;
}

/** Step 2: records the outcome, posts PayU-style fields to surl/furl, and sends the webhook a moment later. */
export function simulatorComplete(txnid: string, outcome: string, credentials: { key: string; salt: string }, webhookUrl: string): Response {
  const order = ledger.get(txnid);
  const valid: SimulatorOutcome[] = ["success", "pending", "failure", "cancel"];
  if (!order || !valid.includes(outcome as SimulatorOutcome)) return page("Payment error", `<main><div class="card">Unknown transaction.</div></main>`);
  if (!order.outcome) {
    order.outcome = outcome as SimulatorOutcome;
    order.mihpayid = `${Date.now()}${randomInt(100, 999)}`;
    order.decidedAt = Date.now();
  }
  const response = responseFor(txnid, order, credentials.key, credentials.salt);
  const target = response.status === "failure" ? order.fields.furl : order.fields.surl;
  if (!target) return page("Payment error", `<main><div class="card">Missing return URL.</div></main>`);

  // PayU's server-to-server webhook usually arrives after the browser is back. Ours is sent anyway, so completing
  // the same payment twice is exercised on every run.
  if (response.status !== "pending") {
    setTimeout(() => {
      void fetch(webhookUrl, { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: new URLSearchParams(response).toString() }).catch(() => {});
    }, 1_500);
  }

  const inputs = Object.entries(response)
    .map(([k, v]) => `<input type="hidden" name="${escape(k)}" value="${escape(v)}">`)
    .join("");
  return page("Returning to the merchant…", `<form method="post" action="${escape(target)}">${inputs}<main><div class="card">Returning to ${BRAND.name}… <button class="ok">Continue</button></div></main></form>`, true);
}

/** verify_payment, answered from the ledger. */
export function simulatorVerify(txnid: string): Verification {
  const order = ledger.get(txnid);
  const none: Verification = { status: "not_found", amountMinor: null, mihpayid: null, mode: null, errorMessage: null, raw: { status: "Not Found" } };
  if (!order?.outcome || !order.mihpayid) return none;
  const base = { amountMinor: amountMinor(order.fields.amount), mihpayid: order.mihpayid, mode: "CC", errorMessage: null };
  switch (order.outcome) {
    case "success":
      return { ...base, status: "success", raw: { status: "success", mihpayid: order.mihpayid, amt: order.fields.amount ?? "" } };
    case "pending": {
      const settled = order.decidedAt !== null && Date.now() - order.decidedAt >= PENDING_SETTLES_MS;
      return { ...base, status: settled ? "success" : "pending", raw: { status: settled ? "success" : "pending", amt: order.fields.amount ?? "" } };
    }
    case "failure":
      return { ...base, status: "failure", errorMessage: "Card declined by the issuing bank", raw: { status: "failure", error_Message: "Card declined" } };
    case "cancel":
      return { ...base, status: "failure", errorMessage: "You cancelled the payment", raw: { status: "failure", error_Message: "User cancelled" } };
  }
}
