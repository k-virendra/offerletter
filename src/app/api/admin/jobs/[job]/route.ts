import { adminActor, auditAs } from "@/lib/admin/auth";
import { isLocalStack } from "@/lib/env.server";
import { runBilling } from "@/lib/jobs/billing.server";
import { runPaymentRecheck } from "@/lib/jobs/payment-recheck.server";
import { todayIso } from "@/lib/template/format";

// The admin panel's "Run" buttons for the periodic jobs. Here rather than in a server action because finishing a
// paid letter renders its PDF, which only the API functions carry Chromium for. Each run is in the audit log.

export const runtime = "nodejs";
export const maxDuration = 300;

const JOBS = ["payment-check", "billing"] as const;

export async function POST(request: Request, { params }: RouteContext<"/api/admin/jobs/[job]">) {
  if (request.headers.get("origin") !== new URL(request.url).origin) return Response.json({ error: "Use the admin panel." }, { status: 403 });
  const actor = await adminActor();
  if (!actor) return Response.json({ error: "Only admins can do this." }, { status: 403 });
  const { job } = await params;
  if (!JOBS.includes(job as (typeof JOBS)[number])) return Response.json({ error: "No such job." }, { status: 404 });

  try {
    let summary: Record<string, unknown>;
    if (job === "billing") {
      // Tests move the clock; only against a local stack.
      const requested = new URL(request.url).searchParams.get("today");
      summary = await runBilling(requested && isLocalStack() && /^\d{4}-\d{2}-\d{2}$/.test(requested) ? requested : todayIso());
    } else {
      summary = await runPaymentRecheck();
    }
    await auditAs(actor, "job_run", "jobs", job, summary);
    return Response.json(summary);
  } catch (error) {
    console.error(`${job} failed`, error);
    return Response.json({ error: "The job failed. Check the logs, then try again." }, { status: 500 });
  }
}
