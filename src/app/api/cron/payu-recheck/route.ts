import { cronAuthorised } from "@/lib/cron.server";
import { PAYMENT_SUMMARY, settlePayment } from "@/lib/payments/process.server";
import { adminClient } from "@/lib/supabase/admin";

// Every 15 minutes (vercel.json): payments that never got a final answer are asked of PayU again, confirmed ones
// whose letter wasn't finished (a PDF that failed to render, an email that didn't go) are finished, and checkouts
// abandoned for a day are closed. Vercel sends "Authorization: Bearer <CRON_SECRET>".

export const runtime = "nodejs";
export const maxDuration = 300;

const MINUTE = 60_000;
const BATCH = 25;

export async function GET(request: Request) {
  if (!cronAuthorised(request)) return Response.json({ error: "Unauthorised" }, { status: 401 });
  const db = adminClient();
  const now = Date.now();
  const iso = (ms: number) => new Date(ms).toISOString();
  const summary = { rechecked: 0, completed: 0, abandoned: 0, errors: 0 };

  const [open, unfinished] = await Promise.all([
    db
      .from("payments")
      .select(PAYMENT_SUMMARY)
      .in("status", ["initiated", "pending"])
      .lt("created_at", iso(now - 15 * MINUTE))
      .gt("created_at", iso(now - 3 * 24 * 60 * MINUTE))
      .order("created_at")
      .limit(BATCH),
    db
      .from("payments")
      .select(PAYMENT_SUMMARY)
      .eq("status", "success")
      .is("receipt_sent_at", null)
      .lt("verified_at", iso(now - 5 * MINUTE))
      .gt("verified_at", iso(now - 3 * 24 * 60 * MINUTE))
      .order("verified_at")
      .limit(BATCH),
  ]);
  if (open.error || unfinished.error) return Response.json({ error: "Couldn't read payments" }, { status: 500 });

  // One at a time: completing renders a PDF.
  for (const payment of [...open.data, ...unfinished.data]) {
    try {
      await settlePayment(payment);
      if (payment.status === "success") summary.completed++;
      else summary.rechecked++;
    } catch (error) {
      summary.errors++;
      console.error("payment recheck failed", payment.txnid, error);
    }
  }

  const { data: abandoned } = await db
    .from("payments")
    .update({ status: "failed", failure_reason: "Checkout was not completed." })
    .eq("status", "initiated")
    .lt("created_at", iso(now - 24 * 60 * MINUTE))
    .select("id");
  summary.abandoned = abandoned?.length ?? 0;

  return Response.json(summary);
}
