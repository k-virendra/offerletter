import { adminActor, auditAs } from "@/lib/admin/auth";
import { findPayment, settlePayment } from "@/lib/payments/process.server";

// "Verify now" in the admin panel: asks PayU about one payment straight away. Confirming it can issue the letter's
// PDF, so it runs here, with the API functions that carry Chromium.

export const runtime = "nodejs";
export const maxDuration = 60;

export async function POST(request: Request, { params }: RouteContext<"/api/admin/payments/[txnid]/verify">) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "Use the admin panel." }, { status: 403 });
  const actor = await adminActor();
  if (!actor) return Response.json({ error: "Only admins can do this." }, { status: 403 });
  const { txnid } = await params;
  const payment = await findPayment(txnid);
  if (!payment) return Response.json({ error: "No payment with this reference." }, { status: 404 });
  const settled = await settlePayment(payment);
  await auditAs(actor, "verify", "payments", payment.id, { txnid, status: settled.status });
  return Response.json({ status: settled.status });
}
