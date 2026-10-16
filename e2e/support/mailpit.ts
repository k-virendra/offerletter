import { expect } from "@playwright/test";

// The local Supabase stack sends auth emails to Mailpit (supabase/config.toml, [inbucket]).
const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:56324";

type MailpitMessage = { HTML: string; Text: string; Subject: string };

export async function latestEmailTo(address: string): Promise<MailpitMessage> {
  let id: string | undefined;
  await expect
    .poll(
      async () => {
        const res = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${address}"`)}&limit=1`);
        const body = (await res.json()) as { messages: { ID: string }[] };
        id = body.messages[0]?.ID;
        return id;
      },
      { message: `an email to ${address}`, timeout: 15_000 },
    )
    .toBeTruthy();
  const res = await fetch(`${MAILPIT_URL}/api/v1/message/${id}`);
  return (await res.json()) as MailpitMessage;
}

export function signInLink(email: MailpitMessage): string {
  const href = email.HTML.match(/href="([^"]*\/auth\/confirm\?[^"]*)"/)?.[1];
  if (!href) throw new Error("No sign-in link in the email");
  return href.replaceAll("&amp;", "&");
}

export function signInCode(email: MailpitMessage): string {
  const code = email.Text.match(/\b(\d{6})\b/)?.[1];
  if (!code) throw new Error("No 6-digit code in the email");
  return code;
}

export function uniqueEmail(label: string): string {
  return `e2e-${label}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}@example.test`;
}
