import { handlePayuResponse } from "@/lib/payments/process.server";
import { readPostedFields } from "@/lib/payu/fields";

// PayU's server-to-server webhook (set in the PayU dashboard: Settings → Webhooks, for successful and failed
// payments). Payment events carry the same signed fields as the browser return and go through the same checks.
// Refund and dispute events aren't signed: they're logged for support and change nothing.
// 200 tells PayU it was handled; a 5xx makes it send the event again.

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const fields = await readPostedFields(request);
  if (!fields.hash) {
    const event = (fields.event ?? fields.status ?? "unknown").slice(0, 60);
    console.info("PayU webhook without a hash (refund or dispute event?)", { event, txnid: fields.txnid?.slice(0, 40), mihpayid: fields.mihpayid?.slice(0, 40) });
    return new Response("ok");
  }
  try {
    await handlePayuResponse(fields, "webhook");
    return new Response("ok");
  } catch (error) {
    console.error("PayU webhook failed", error);
    return new Response("error", { status: 500 });
  }
}
