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
});

let cached: z.infer<typeof schema> | undefined;

export function serverEnv() {
  cached ??= schema.parse({
    SUPABASE_SECRET_KEY: process.env.SUPABASE_SECRET_KEY,
    ALLOW_UNREVIEWED_CLAUSES: process.env.ALLOW_UNREVIEWED_CLAUSES,
    RENDER_TOKEN_SECRET: process.env.RENDER_TOKEN_SECRET,
    CHROME_EXECUTABLE_PATH: process.env.CHROME_EXECUTABLE_PATH || undefined,
    RENDER_BASE_URL: process.env.RENDER_BASE_URL || undefined,
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
