import { z } from "zod";
import { COUNTRY_CODES } from "@/lib/countries";

// Checkout details: who pays and where the receipt goes. Checked in the browser for quick feedback and again on the
// server, which is the only check that counts.

const text = (max: number) => z.string().trim().max(max, `Use ${max} characters or fewer.`);

export const billingSchema = z.object({
  fullName: text(120).min(1, "Enter the name of the person paying."),
  email: z.string().trim().max(254).pipe(z.email({ message: "Enter an email address like name@company.com." })),
  companyName: text(200).optional().default(""),
  country: z.enum(COUNTRY_CODES, { message: "Choose a country." }),
  postalCode: text(20).min(1, "Enter the postal code of the billing address."),
  address: text(300).optional().default(""),
  authorised: z.literal(true, { message: "Confirm that you may issue this letter for the company." }),
});

export type Billing = z.output<typeof billingSchema>;
export type BillingErrors = Partial<Record<keyof Billing, string>>;

/** What a "Pay" server action answers: the signed form to post to PayU, or why not. */
export type CheckoutResult = { ok: true; action: string; fields: Record<string, string> } | { ok: false; message: string; errors?: BillingErrors; pendingTxnid?: string };

/** What a payment row keeps (the authorisation is recorded with its time). */
export function billingRecord(billing: Billing, now = new Date()) {
  const details: Partial<Billing> = { ...billing };
  delete details.authorised;
  return { ...details, authorised_at: now.toISOString() };
}

export function billingErrors(error: z.ZodError): BillingErrors {
  const errors: BillingErrors = {};
  for (const issue of error.issues) {
    const key = issue.path[0] as keyof Billing | undefined;
    if (key && !errors[key]) errors[key] = issue.message;
  }
  return errors;
}

/** Turns PayU's reason for a failed payment into words people understand (its own text is often a code). */
export function failureReason(details: { unmappedStatus?: string | null; message?: string | null }): string {
  const text = `${details.unmappedStatus ?? ""} ${details.message ?? ""}`.toLowerCase();
  if (/cancel/.test(text)) return "The payment was cancelled before it finished.";
  if (/insufficient|not enough|funds/.test(text)) return "Your bank says there weren’t enough funds.";
  if (/otp|3d ?s|authenticat/.test(text)) return "The bank’s security check didn’t finish.";
  if (/declin|not authori[sz]ed|do not honou?r|restricted/.test(text)) return "Your bank declined the payment.";
  if (/expir|time ?out|timed out/.test(text)) return "The payment timed out before it finished.";
  return "PayU couldn’t complete the payment.";
}
