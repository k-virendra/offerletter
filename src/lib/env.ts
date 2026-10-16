import { z } from "zod";

// Public configuration. Each variable is referenced literally so Next.js can inline it into the browser bundle.
const schema = z.object({
  NEXT_PUBLIC_APP_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_URL: z.url(),
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: z.string().min(10),
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: z
    .string()
    .optional()
    .transform((value) => value || undefined),
  NEXT_PUBLIC_GOOGLE_SIGN_IN: z
    .enum(["true", "false", ""])
    .optional()
    .transform((value) => value === "true"),
});

export const publicEnv = schema.parse({
  NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL,
  NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL,
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY,
  NEXT_PUBLIC_GOOGLE_SIGN_IN: process.env.NEXT_PUBLIC_GOOGLE_SIGN_IN,
});
