import { BRAND } from "@/lib/brand";
import type { Email } from "./send.server";

// One plain layout for transactional emails: a greeting, a few paragraphs, optional details and one button.
// Every value is escaped; the text version says the same as the HTML.

export type EmailContent = {
  to: string;
  subject: string;
  greeting: string;
  paragraphs: string[];
  rows?: [string, string][];
  button?: { label: string; href: string };
  footnote?: string;
};

export const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function composeEmail({ to, subject, greeting, paragraphs, rows = [], button, footnote }: EmailContent): Email {
  const text = [
    greeting,
    "",
    ...paragraphs.flatMap((p) => [p, ""]),
    ...(rows.length ? [...rows.map(([label, value]) => `${label}: ${value}`), ""] : []),
    ...(button ? [`${button.label}: ${button.href}`, ""] : []),
    ...(footnote ? [footnote, ""] : []),
    BRAND.name,
  ].join("\n");

  const html = `<!doctype html><html lang="en"><body style="margin:0;background:#f7f7f4;font-family:-apple-system,'Segoe UI',Arial,sans-serif;color:#14181f">
<div style="max-width:520px;margin:0 auto;padding:28px 20px">
<p style="font-size:15px;margin:0 0 12px">${escapeHtml(greeting)}</p>
${paragraphs.map((p) => `<p style="font-size:15px;line-height:1.5;margin:0 0 14px">${escapeHtml(p)}</p>`).join("\n")}
${
  rows.length
    ? `<table role="presentation" style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e3e3de;border-radius:12px;margin:6px 0 4px">
${rows.map(([label, value]) => `<tr><td style="padding:10px 14px;font-size:13px;color:#5b6472;border-top:1px solid #eeeee9;width:120px">${escapeHtml(label)}</td><td style="padding:10px 14px;font-size:14px;border-top:1px solid #eeeee9">${escapeHtml(value)}</td></tr>`).join("\n")}
</table>`
    : ""
}
${button ? `<p style="margin:22px 0 12px"><a href="${escapeHtml(button.href)}" style="display:inline-block;background:#0f6e5f;color:#fff;text-decoration:none;font-weight:600;padding:12px 18px;border-radius:10px">${escapeHtml(button.label)}</a></p>` : ""}
${footnote ? `<p style="font-size:13px;color:#5b6472;margin:14px 0 0">${escapeHtml(footnote)}</p>` : ""}
<p style="font-size:13px;color:#5b6472;margin:16px 0 0">${escapeHtml(BRAND.name)}</p>
</div></body></html>`;
  return { to, subject, html, text };
}
