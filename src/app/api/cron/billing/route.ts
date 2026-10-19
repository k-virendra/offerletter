import { cronAuthorised } from "@/lib/cron.server";
import { isLocalStack } from "@/lib/env.server";
import { runBilling } from "@/lib/jobs/billing.server";
import { todayIso } from "@/lib/template/format";

// Billing for an outside scheduler (Bearer CRON_SECRET). Admins run the same job from the admin panel.

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  if (!cronAuthorised(request)) return Response.json({ error: "Unauthorised" }, { status: 401 });
  // Tests move the clock; only against a local stack.
  const requested = new URL(request.url).searchParams.get("today");
  const today = requested && isLocalStack() && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : todayIso();
  try {
    return Response.json(await runBilling(today));
  } catch (error) {
    console.error("billing failed", error);
    return Response.json({ error: "Billing failed" }, { status: 500 });
  }
}
