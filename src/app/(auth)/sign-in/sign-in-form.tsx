"use client";

import { Turnstile } from "@marsidev/react-turnstile";
import { CircleAlert, Mail } from "lucide-react";
import { useActionState, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Field, fieldControlProps, Input } from "@/components/ui/field";
import { sendMagicLink, signInWithGoogle, verifyCode, type SignInState } from "./actions";

const RESEND_AFTER_SECONDS = 60;

const URL_ERRORS: Record<string, string> = {
  link_expired: "This sign-in link has expired or was already used. We can send you a new one.",
  google: "Google sign-in didn’t work. Try again, or use your email.",
};

export function SignInForm({
  next,
  googleEnabled,
  turnstileSiteKey,
  urlError,
}: {
  next: string;
  googleEnabled: boolean;
  turnstileSiteKey?: string;
  urlError?: string;
}) {
  const [sendState, sendAction, sending] = useActionState<SignInState, FormData>(sendMagicLink, { status: "idle" });
  const [verifyState, verifyAction, verifying] = useActionState<SignInState, FormData>(verifyCode, { status: "idle" });
  const [changingEmail, setChangingEmail] = useState(false);

  const sentTo = !changingEmail && sendState.status === "sent" ? sendState.email : null;
  const sentAt = sendState.status === "sent" ? sendState.sentAt : 0;
  const sendError = sendState.status === "error" ? sendState : null;
  const codeError = verifyState.status === "error" ? verifyState : null;
  const pageError = urlError ? URL_ERRORS[urlError] : undefined;

  const secondsLeft = useCountdown(sentAt, RESEND_AFTER_SECONDS);

  if (sentTo) {
    return (
      <div className="flex flex-col gap-5" role="status">
        <Mail aria-hidden className="size-10 text-evergreen-600" strokeWidth={1.6} />
        <div>
          <h2 className="font-display text-[32px] leading-tight font-medium">Check your email</h2>
          <p className="mt-2 text-base leading-relaxed text-ink-2">
            We sent a sign-in link to <strong className="text-ink">{sentTo}</strong>. It works once and expires in 15 minutes.
          </p>
        </div>

        <form action={verifyAction} className="flex flex-col gap-3" noValidate>
          <input type="hidden" name="email" value={sentTo} />
          <input type="hidden" name="next" value={next} />
          <Field id="code" label="Or enter the 6-digit code" required error={codeError?.field === "code" ? codeError.message : undefined}>
            <Input
              {...fieldControlProps("code", { error: codeError?.field === "code" ? codeError.message : undefined })}
              name="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              className="h-12 text-lg tracking-[0.3em]"
            />
          </Field>
          <Button type="submit" size="lg" disabled={verifying}>
            {verifying ? "Checking…" : "Sign in with code"}
          </Button>
        </form>

        <div className="flex flex-wrap items-center gap-2">
          <form action={sendAction}>
            <input type="hidden" name="email" value={sentTo} />
            <input type="hidden" name="next" value={next} />
            <Button type="submit" variant="outline" disabled={secondsLeft > 0 || sending}>
              {secondsLeft > 0 ? `Resend in 0:${String(secondsLeft).padStart(2, "0")}` : sending ? "Sending…" : "Send a new link"}
            </Button>
          </form>
          <Button variant="ghost" className="text-evergreen-600" onClick={() => setChangingEmail(true)}>
            Use a different email
          </Button>
        </div>
      </div>
    );
  }

  const emailError = sendError?.field === "email" ? sendError.message : undefined;
  const generalError = sendError && !sendError.field ? sendError.message : pageError;

  return (
    <div className="flex flex-col gap-5">
      {generalError ? (
        <p role="alert" className="flex items-start gap-2 rounded-xl border-2 border-danger bg-[#FFFBFA] px-4 py-3 text-sm text-danger-700">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {generalError}
        </p>
      ) : null}

      {googleEnabled ? (
        <>
          <form action={signInWithGoogle}>
            <input type="hidden" name="next" value={next} />
            <Button type="submit" variant="outline" size="lg" className="w-full">
              <span aria-hidden className="inline-flex size-[22px] items-center justify-center rounded-full border-2 border-ink-2 text-xs font-bold">
                G
              </span>
              Continue with Google
            </Button>
          </form>
          <div className="flex items-center gap-3 text-[13px] text-muted">
            <span className="h-px flex-1 bg-line" />
            or use your email
            <span className="h-px flex-1 bg-line" />
          </div>
        </>
      ) : null}

      <form action={sendAction} onSubmit={() => setChangingEmail(false)} className="flex flex-col gap-4" noValidate>
        <input type="hidden" name="next" value={next} />
        <Field id="email" label="Work email" required help="Receipts go to this address too." error={emailError}>
          <Input
            {...fieldControlProps("email", { error: emailError, help: "Receipts go to this address too." })}
            name="email"
            type="email"
            autoComplete="email"
            defaultValue={sendError?.email ?? (sendState.status === "sent" ? sendState.email : "")}
            className="h-12 text-base"
          />
        </Field>
        {turnstileSiteKey ? <Turnstile siteKey={turnstileSiteKey} options={{ action: "sign-in", size: "flexible" }} /> : null}
        <Button type="submit" size="lg" disabled={sending}>
          {sending ? "Sending…" : "Email me a sign-in link"}
        </Button>
      </form>
    </div>
  );
}

function useCountdown(startedAt: number, seconds: number): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!startedAt) return;
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, [startedAt]);
  if (!startedAt) return 0;
  return Math.max(0, Math.ceil((startedAt + seconds * 1000 - now) / 1000));
}
