"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { publicEnv } from "@/lib/env";
import { clientKey, takeRateLimit } from "@/lib/rate-limit";
import { safeNext } from "@/lib/safe-next";
import { createClient } from "@/lib/supabase/server";

export type SignInState =
  | { status: "idle" }
  | { status: "sent"; email: string; next: string; sentAt: number }
  | { status: "error"; message: string; field?: "email" | "code"; email?: string; next?: string; sent?: boolean };

const emailSchema = z.string().trim().toLowerCase().pipe(z.email({ message: "Enter a full email address, like name@company.com" }));

function friendlyAuthError(message: string): string {
  if (/rate limit|too many|seconds/i.test(message)) return "Too many sign-in emails. Wait a minute, then try again.";
  if (/captcha/i.test(message)) return "The security check didn’t pass. Try it again.";
  return "We couldn’t send the sign-in email. Try again in a moment.";
}

export async function sendMagicLink(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const next = safeNext(formData.get("next"));
  const parsed = emailSchema.safeParse(formData.get("email"));
  if (!parsed.success) {
    return { status: "error", field: "email", message: parsed.error.issues[0]?.message ?? "Enter your email address", next };
  }
  const email = parsed.data;

  const ip = await clientKey();
  const [ipAllowed, emailAllowed] = await Promise.all([
    takeRateLimit(`sign-in:ip:${ip}`, 600, 10),
    takeRateLimit(`sign-in:email:${email}`, 3600, 5),
  ]);
  if (!ipAllowed || !emailAllowed) {
    return { status: "error", message: "Too many sign-in attempts. Wait a few minutes, then try again.", email, next };
  }

  const captchaToken = formData.get("cf-turnstile-response");
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: true,
      emailRedirectTo: `${publicEnv.NEXT_PUBLIC_APP_URL}/auth/confirm?next=${encodeURIComponent(next)}`,
      captchaToken: typeof captchaToken === "string" && captchaToken ? captchaToken : undefined,
    },
  });
  if (error) {
    console.error("signInWithOtp failed", error.status, error.message);
    return { status: "error", message: friendlyAuthError(error.message), email, next };
  }
  return { status: "sent", email, next, sentAt: Date.now() };
}

const codeSchema = z.string().trim().regex(/^\d{6}$/, "Enter the 6-digit code from the email");

export async function verifyCode(_prev: SignInState, formData: FormData): Promise<SignInState> {
  const next = safeNext(formData.get("next"));
  const email = emailSchema.safeParse(formData.get("email"));
  const code = codeSchema.safeParse(formData.get("code"));
  if (!email.success) return { status: "error", message: "Start again with your email address.", next };
  if (!code.success) {
    return { status: "error", field: "code", message: code.error.issues[0]?.message ?? "Enter the code", email: email.data, next, sent: true };
  }

  const ip = await clientKey();
  if (!(await takeRateLimit(`verify:ip:${ip}`, 600, 20))) {
    return { status: "error", field: "code", message: "Too many attempts. Wait a few minutes, then try again.", email: email.data, next, sent: true };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email: email.data, token: code.data, type: "email" });
  if (error) {
    return { status: "error", field: "code", message: "That code is wrong or has expired. Check the latest email, or send a new one.", email: email.data, next, sent: true };
  }
  redirect(next);
}

export async function signInWithGoogle(formData: FormData) {
  const next = safeNext(formData.get("next"));
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: { redirectTo: `${publicEnv.NEXT_PUBLIC_APP_URL}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error || !data.url) redirect("/sign-in?error=google");
  redirect(data.url);
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}
