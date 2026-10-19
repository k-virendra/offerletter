import { cronAuthorised } from "@/lib/cron.server";
import { runPaymentRecheck } from "@/lib/jobs/payment-recheck.server";

// The payment check for an outside scheduler (Bearer CRON_SECRET). Admins run the same job from the admin panel.

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!cronAuthorised(request)) return Response.json({ error: "Unauthorised" }, { status: 401 });
  try {
    return Response.json(await runPaymentRecheck());
  } catch (error) {
    console.error("payment recheck failed", error);
    return Response.json({ error: "The payment check failed" }, { status: 500 });
  }
}
