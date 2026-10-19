import type { Email } from "./send.server";
import { BRAND } from "@/lib/brand";

// The receipt email sent once a payment is confirmed. Plain, with the reference people quote to support, and
// links back to the letter and the printable receipt.

export type ReceiptDetails = {
  to: string;
  name: string;
  reference: string;
  paidOn: string;
  /** The price as shown on the site, e.g. "₹499.00". */
  price: string;
  /** What PayU charged: the same, unless the site shows another currency. */
  charged: string;
  letterName: string;
  companyName: string;
  letterUrl: string;
  receiptUrl: string;
  correctionsUntil: string;
  /** The language the letter also comes in, e.g. "German". */
  translation?: string | null;
};

const escape = (value: string) => value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

export function receiptEmail(details: ReceiptDetails): Email {
  const ready = details.translation
    ? `Thanks for your payment. Your offer letter is ready to download, in English and ${details.translation} (the English version prevails).`
    : "Thanks for your payment. Your offer letter is ready to download.";
  const charge = details.charged === details.price ? details.price : `${details.price} (charged by PayU as ${details.charged})`;
  const rows: [string, string][] = [
    ["Letter", `${details.letterName} · ${details.companyName}`],
    ["Amount", charge],
    ["Paid on", details.paidOn],
    ["Reference", details.reference],
  ];
  const text = [
    `Hi ${details.name},`,
    "",
    ready,
    "",
    ...rows.map(([label, value]) => `${label}: ${value}`),
    "",
    `Your letter: ${details.letterUrl}`,
    `Receipt: ${details.receiptUrl}`,
    "",
    `You can correct mistakes for free until ${details.correctionsUntil}.`,
    "",
    BRAND.name,
  ].join("\n");
  const html = `<!doctype html><html lang="en"><body style="margin:0;background:#f7f7f4;font-family:-apple-system,'Segoe UI',Arial,sans-serif;color:#14181f">
<div style="max-width:520px;margin:0 auto;padding:28px 20px">
<p style="font-size:15px;margin:0 0 12px">Hi ${escape(details.name)},</p>
<p style="font-size:15px;margin:0 0 20px">${escape(ready)}</p>
<table role="presentation" style="width:100%;border-collapse:collapse;background:#fff;border:1px solid #e3e3de;border-radius:12px">
${rows.map(([label, value]) => `<tr><td style="padding:10px 14px;font-size:13px;color:#5b6472;border-top:1px solid #eeeee9;width:110px">${escape(label)}</td><td style="padding:10px 14px;font-size:14px;border-top:1px solid #eeeee9">${escape(value)}</td></tr>`).join("\n")}
</table>
<p style="margin:24px 0 12px"><a href="${escape(details.letterUrl)}" style="display:inline-block;background:#0f6e5f;color:#fff;text-decoration:none;font-weight:600;padding:12px 18px;border-radius:10px">Open your letter</a></p>
<p style="font-size:14px;margin:0 0 20px"><a href="${escape(details.receiptUrl)}" style="color:#0a5246">View or print the receipt</a></p>
<p style="font-size:13px;color:#5b6472;margin:0">You can correct mistakes for free until ${escape(details.correctionsUntil)}.</p>
<p style="font-size:13px;color:#5b6472;margin:16px 0 0">${BRAND.name}</p>
</div></body></html>`;
  return { to: details.to, subject: `Your receipt for ${details.letterName} (${details.reference})`, html, text };
}
