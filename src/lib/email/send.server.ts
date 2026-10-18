import "server-only";
import { isLocalStack, serverEnv } from "@/lib/env.server";
import { BRAND } from "@/lib/brand";

// Transactional email (receipts). Resend when RESEND_API_KEY is set; on a local stack without it, the local Mailpit
// inbox (the one sign-in emails go to), so receipts can be checked during development.

export type Email = { to: string; subject: string; html: string; text: string };

const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:56324";

export async function sendEmail(email: Email): Promise<boolean> {
  const { RESEND_API_KEY, EMAIL_FROM } = serverEnv();
  try {
    if (RESEND_API_KEY) {
      if (!EMAIL_FROM) throw new Error("EMAIL_FROM is required with RESEND_API_KEY");
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { authorization: `Bearer ${RESEND_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({ from: EMAIL_FROM, to: [email.to], subject: email.subject, html: email.html, text: email.text }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`Resend answered ${response.status}: ${(await response.text()).slice(0, 200)}`);
      return true;
    }
    if (isLocalStack()) {
      const response = await fetch(`${MAILPIT_URL}/api/v1/send`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          From: { Email: `billing@${BRAND.domain}`, Name: BRAND.name },
          To: [{ Email: email.to }],
          Subject: email.subject,
          HTML: email.html,
          Text: email.text,
        }),
        signal: AbortSignal.timeout(5_000),
      });
      if (!response.ok) throw new Error(`Mailpit answered ${response.status}`);
      return true;
    }
    console.warn("No email provider configured: set RESEND_API_KEY and EMAIL_FROM");
    return false;
  } catch (error) {
    console.error("sending email failed", error);
    return false;
  }
}
