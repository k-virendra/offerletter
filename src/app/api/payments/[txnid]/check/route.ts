import { getUser } from "@/lib/auth";
import { checkOwnPayment } from "@/lib/payments/status.server";
import { takeRateLimit } from "@/lib/rate-limit";

// The payment status page asks this every few seconds while a payment is being confirmed. Confirming it can
// issue the letter's PDF, so it runs here, with the API functions that carry Chromium.

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(_request: Request, { params }: RouteContext<"/api/payments/[txnid]/check">) {
  const { txnid } = await params;
  const user = await getUser();
  if (!user) return Response.json({ error: "Sign in first" }, { status: 401 });
  if (!(await takeRateLimit(`payment-check:${user.id}`, 600, 120))) return Response.json({ error: "Too many checks" }, { status: 429 });
  const result = await checkOwnPayment(user.id, txnid);
  if (result.status === "unknown") return Response.json({ error: "Not found" }, { status: 404 });
  return Response.json(result, { headers: { "cache-control": "private, no-store" } });
}
