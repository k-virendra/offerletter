import "server-only";
import { PAYMENT_SUMMARY, settlePayment } from "@/lib/payments/process.server";
import { adminClient } from "@/lib/supabase/admin";

// "Check payments" (run by an admin from the panel): payments that never got a final answer are asked of PayU
// again, confirmed ones whose letter or invoice wasn't finished (a PDF that failed to render, an email that didn't
// go) are finished, and checkouts abandoned for a day are closed. Usually the browser's return and PayU's
// webhook settle everything; this catches the rest. Safe to run as often as you like.

const MINUTE = 60_000;
const DAY = 24 * 60 * MINUTE;
/** Run by hand, perhaps not every day: look back two weeks. */
const LOOK_BACK = 14 * DAY;
const BATCH = 100;

export type RecheckSummary = { rechecked: number; completed: number; abandoned: number; errors: number };

export async function runPaymentRecheck(now = Date.now()): Promise<RecheckSummary> {
  const db = adminClient();
  const iso = (ms: number) => new Date(ms).toISOString();
  const summary: RecheckSummary = { rechecked: 0, completed: 0, abandoned: 0, errors: 0 };

  const [open, unfinished] = await Promise.all([
    db
      .from("payments")
      .select(PAYMENT_SUMMARY)
      .in("status", ["initiated", "pending"])
      .lt("created_at", iso(now - 15 * MINUTE))
      .gt("created_at", iso(now - LOOK_BACK))
      .order("created_at")
      .limit(BATCH),
    db
      .from("payments")
      .select(PAYMENT_SUMMARY)
      .eq("status", "success")
      .is("receipt_sent_at", null)
      .lt("verified_at", iso(now - 5 * MINUTE))
      .gt("verified_at", iso(now - LOOK_BACK))
      .order("verified_at")
      .limit(BATCH),
  ]);
  if (open.error || unfinished.error) throw new Error(`Couldn't read payments: ${(open.error ?? unfinished.error)?.message}`);

  // One at a time: completing a letter renders a PDF.
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
    .lt("created_at", iso(now - DAY))
    .select("id");
  summary.abandoned = abandoned?.length ?? 0;
  return summary;
}
