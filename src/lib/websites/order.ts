import { z } from "zod";

// What a customer tells us when ordering a website. Checked in the browser for quick feedback and again on the
// server. Billing details are checked separately (src/lib/payments/billing.ts).

export const PAGE_OPTIONS = ["Home", "About us", "Services", "Products", "Gallery", "Testimonials", "Contact"] as const;

const DOMAIN = /^([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/;

/** "https://www.My-Bakery.in/" → "my-bakery.in". */
export function normalizeDomain(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, "")
    .replace(/[/?#].*$/, "")
    .replace(/^www\./, "")
    .replace(/\.$/, "");
}

/** The domain check's answer (a hint from public registry data, see /api/domains/check). */
export type DomainCheck = { domain: string; result: "available" | "taken" | "unknown" };

export function isDomain(value: string): boolean {
  return value.length <= 253 && DOMAIN.test(value);
}

export const orderSchema = z.object({
  companyId: z.uuid({ message: "Choose the business this website is for." }),
  domains: z
    .array(z.string())
    .transform((values) => [...new Set(values.map(normalizeDomain).filter(Boolean))])
    .pipe(
      z
        .array(z.string().refine(isDomain, { message: "Enter domains like mybusiness.in or mybusiness.com." }))
        .min(1, "Enter at least one domain you’d like.")
        .max(3, "Give us up to three domains."),
    ),
  mailboxName: z
    .string()
    .trim()
    .toLowerCase()
    .regex(/^[a-z0-9]([a-z0-9._-]{0,62}[a-z0-9])?$/, "Use letters, numbers, dots or dashes, like info or anita."),
  about: z.string().trim().min(20, "Tell us about the business in a few sentences.").max(2000, "Keep it under 2,000 characters."),
  pages: z.array(z.enum(PAGE_OPTIONS)).max(PAGE_OPTIONS.length),
  references: z.string().trim().max(500, "Keep it under 500 characters."),
  contactPhone: z
    .string()
    .trim()
    .min(6, "Enter a phone number we can call or WhatsApp about the website.")
    .max(40)
    .regex(/^[+\d][\d\s()-]{4,}$/, "Enter a phone number like +91 98765 43210."),
});

export type OrderInput = z.input<typeof orderSchema>;
export type Order = z.output<typeof orderSchema>;
export type OrderErrors = Partial<Record<keyof Order, string>>;

export function orderErrors(error: z.ZodError): OrderErrors {
  const errors: OrderErrors = {};
  for (const issue of error.issues) {
    const key = issue.path[0] as keyof Order | undefined;
    if (key && !errors[key]) errors[key] = issue.message;
  }
  return errors;
}
