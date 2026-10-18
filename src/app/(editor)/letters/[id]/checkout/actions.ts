"use server";

import { z } from "zod";
import { getUser } from "@/lib/auth";
import { blockingProblems } from "@/lib/letter/fields";
import { billingErrors, billingSchema, type CheckoutResult } from "@/lib/payments/billing";
import { activePrices } from "@/lib/payments/prices.server";
import { startPayment } from "@/lib/payments/start.server";
import { snapshotDraft } from "@/lib/pdf/inputs.server";
import { contentHash } from "@/lib/pdf/snapshot";
import { takeRateLimit } from "@/lib/rate-limit";
import { adminClient } from "@/lib/supabase/admin";
import type { Json } from "@/lib/supabase/database.types";
import { createClient } from "@/lib/supabase/server";

export type StartCheckoutResult = CheckoutResult;

/**
 * "Pay": checks everything again on the server, freezes the letter as it is now, records the payment with the
 * price from the database and returns the signed form the browser posts to PayU.
 */
export async function startCheckout(letterId: string, input: Record<string, unknown>): Promise<StartCheckoutResult> {
  const user = await getUser();
  if (!user) return { ok: false, message: "Your session has ended. Sign in again to pay." };
  if (!z.uuid().safeParse(letterId).success) return { ok: false, message: "We couldn’t find this letter." };

  const parsed = billingSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Check the highlighted details.", errors: billingErrors(parsed.error) };
  if (!(await takeRateLimit(`checkout:${user.id}`, 600, 10))) {
    return { ok: false, message: "You’ve started several payments in a short time. Wait a few minutes, then try again." };
  }

  // RLS: only the author can read the letter.
  const supabase = await createClient();
  const { data: letter } = await supabase.from("letters").select("id, status, company_id, companies(archived_at, suspended_at)").eq("id", letterId).eq("author_id", user.id).maybeSingle();
  if (!letter?.companies) return { ok: false, message: "We couldn’t find this letter. It may have been deleted." };
  if (letter.status !== "draft") return { ok: false, message: "This letter has already been paid for." };
  if (letter.companies.suspended_at) return { ok: false, message: "Letters for this company are paused. Contact support to find out more." };
  if (letter.companies.archived_at) return { ok: false, message: "This company is archived. Restore it in My companies first." };

  const admin = adminClient();
  const { data: pending } = await admin.from("payments").select("txnid").eq("letter_id", letterId).eq("status", "pending").limit(1).maybeSingle();
  if (pending) return { ok: false, message: "A payment for this letter is still being confirmed.", pendingTxnid: pending.txnid };

  const frozen = await snapshotDraft(letterId);
  if (!frozen) return { ok: false, message: "Letters for this country aren’t available right now." };
  const problems = blockingProblems(frozen.snapshot.context, frozen.snapshot.state, frozen.snapshot.date);
  if (problems.missing.length || problems.invalid.length) {
    return { ok: false, message: "Some details in the letter are missing or need a fix. Go back to the letter to finish them." };
  }

  const prices = await activePrices();
  const started = await startPayment({
    kind: "letter",
    userId: user.id,
    companyId: letter.company_id,
    billing: parsed.data,
    charge: prices.charge,
    display: prices.display,
    productinfo: "Offer letter",
    letterId,
    snapshot: frozen.snapshot as unknown as Json,
    companySnapshot: frozen.company as unknown as Json,
    contentHash: contentHash(frozen.snapshot, frozen.company),
  });
  return started.ok ? { ok: true, action: started.action, fields: started.fields } : started;
}
