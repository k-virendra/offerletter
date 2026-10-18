import "server-only";
import { z } from "zod";

// Server-only configuration. Never import this from a Client Component.
const schema = z.object({
  SUPABASE_SECRET_KEY: z.string().min(10),
  ALLOW_UNREVIEWED_CLAUSES: z.enum(["true", "false", ""]).optional(),
  RENDER_TOKEN_SECRET: z.string().min(32),
  /** A local Chrome for PDFs in development (on Linux, as on Vercel, @sparticuz/chromium is used instead). */
  CHROME_EXECUTABLE_PATH: z.string().optional(),
  /** Where headless Chrome opens the print page. Defaults to the deployment URL, then the app URL. */
  RENDER_BASE_URL: z.url().optional(),
  /** simulator (local Supabase only), test (PayU sandbox) or live. Defaults to simulator on a local stack. */
  PAYU_MODE: z.enum(["simulator", "test", "live"]).optional(),
  PAYU_MERCHANT_KEY: z.string().min(1).optional(),
  PAYU_MERCHANT_SALT: z.string().min(1).optional(),
  /** Vercel sends it as "Authorization: Bearer <CRON_SECRET>" to scheduled jobs. */
  CRON_SECRET: z.string().min(16).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  /** e.g. "AI Company Wala <billing@aicompanywala.com>"; the domain must be verified in Resend. */
  EMAIL_FROM: z.string().min(3).optional(),
  /** Where the team is told about new website orders. */
  ADMIN_NOTIFY_EMAIL: z.email().optional(),
  /** The seller printed on receipts: legal name, address, tax number. "|" starts a new line. */
  RECEIPT_SELLER: z.string().max(500).optional(),
});

let cached: z.infer<typeof schema> | undefined;

export function serverEnv() {
  cached ??= schema.parse({
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    ALLOW_UNREVIEWED_CLAUSES: process.env.ALLOW_UNREVIEWED_CLAUSES,
    RENDER_TOKEN_SECRET: process.env.RENDER_TOKEN_SECRET,
    CHROME_EXECUTABLE_PATH: process.env.CHROME_EXECUTABLE_PATH || undefined,
    RENDER_BASE_URL: process.env.RENDER_BASE_URL || undefined,
    PAYU_MODE: process.env.PAYU_MODE || undefined,
    PAYU_MERCHANT_KEY: process.env.PAYU_MERCHANT_KEY || undefined,
    PAYU_MERCHANT_SALT: process.env.PAYU_MERCHANT_SALT || undefined,
    CRON_SECRET: process.env.CRON_SECRET || undefined,
    RESEND_API_KEY: process.env.RESEND_API_KEY || undefined,
    EMAIL_FROM: process.env.EMAIL_FROM || undefined,
    RECEIPT_SELLER: process.env.RECEIPT_SELLER || undefined,
    ADMIN_NOTIFY_EMAIL: process.env.ADMIN_NOTIFY_EMAIL || undefined,
  });
  return cached;
}

/**
 * Draft clauses may be shown (with an "Unreviewed wording" banner) only against a local Supabase stack. That covers
 * `pnpm dev` and the local production build the end-to-end tests use, and rules out every hosted environment
 * (preview or production) even if the flag were set there by mistake.
 */
export function allowUnreviewedClauses(): boolean {
  return isLocalStack() && serverEnv().ALLOW_UNREVIEWED_CLAUSES === "true";
}

/** True only against a local Supabase stack: development tools (e.g. issuing without payment) depend on it. */
export function isLocalStack(): boolean {
  return /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\/?$/.test(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "");
}
