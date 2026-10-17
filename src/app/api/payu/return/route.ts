import { handlePayuResponse } from "@/lib/payments/process.server";
import { appUrl } from "@/lib/payu/gateway.server";
import { readPostedFields } from "@/lib/payu/fields";

// PayU posts the customer back here after paying (success and failure alike). The post itself proves nothing: it
// starts verification, and the customer lands on the payment's status page, which shows what PayU confirmed.
// Cross-site, so the session cookie usually isn't sent with it: nothing here depends on who is signed in.

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request) {
  const fields = await readPostedFields(request);
  let payment = null;
  try {
    payment = await handlePayuResponse(fields, "return");
  } catch (error) {
    // The status page checks again.
    console.error("PayU return failed", error);
  }
  const target = payment?.letter_id ? `/letters/${payment.letter_id}/checkout/${payment.txnid}` : "/dashboard";
  return new Response(null, { status: 303, headers: { location: `${appUrl()}${target}`, "cache-control": "no-store" } });
}
