import { composeEmail } from "@/lib/email/layout";
import type { Email } from "@/lib/email/send.server";

// Emails about business websites: to the customer as the order moves along, and to the team when there's work.

type Customer = { to: string; name: string };

export function orderReceivedEmail(c: Customer & { amount: string; reference: string; domains: string[]; dashboardUrl: string; receiptUrl: string }): Email {
  return composeEmail({
    to: c.to,
    subject: "We’ve received your website order",
    greeting: `Hi ${c.name},`,
    paragraphs: [
      "Thanks for your payment. Our team is starting on your website now.",
      "What happens next: we register your domain, build your website and set up your business email address. We’ll email you at each step, and you can follow progress on your website page.",
    ],
    rows: [
      ["Paid", c.amount],
      ["Reference", c.reference],
      ["Domain choices", c.domains.join(", ")],
    ],
    button: { label: "See your website’s progress", href: c.dashboardUrl },
    footnote: `Receipt: ${c.receiptUrl}`,
  });
}

export function newOrderAlert(to: string, o: { business: string; customer: string; domains: string[]; adminUrl: string }): Email {
  return composeEmail({
    to,
    subject: `New website order: ${o.business}`,
    greeting: "Hello,",
    paragraphs: ["A customer has paid for a business website. It’s waiting in the admin panel to be set up."],
    rows: [
      ["Business", o.business],
      ["Customer", o.customer],
      ["Domain choices", o.domains.join(", ")],
    ],
    button: { label: "Open the order", href: o.adminUrl },
  });
}

export function invoicePaidEmail(c: Customer & { description: string; amount: string; reference: string; paidOn: string; dashboardUrl: string; receiptUrl: string }): Email {
  return composeEmail({
    to: c.to,
    subject: `Payment received: ${c.description}`,
    greeting: `Hi ${c.name},`,
    paragraphs: ["Thanks, we’ve received your payment."],
    rows: [
      ["For", c.description],
      ["Amount", c.amount],
      ["Paid on", c.paidOn],
      ["Reference", c.reference],
    ],
    button: { label: "View the receipt", href: c.receiptUrl },
    footnote: `Your website and invoices: ${c.dashboardUrl}`,
  });
}

export function invoiceReadyEmail(c: Customer & { description: string; amount: string; dueOn: string; payUrl: string }): Email {
  return composeEmail({
    to: c.to,
    subject: `Your invoice: ${c.description}`,
    greeting: `Hi ${c.name},`,
    paragraphs: [`Your next payment of ${c.amount} is due on ${c.dueOn}. You can pay it now from your website page.`],
    rows: [
      ["For", c.description],
      ["Amount", c.amount],
      ["Due on", c.dueOn],
    ],
    button: { label: "Pay now", href: c.payUrl },
  });
}

export function invoiceOverdueEmail(c: Customer & { description: string; amount: string; dueOn: string; payUrl: string }): Email {
  return composeEmail({
    to: c.to,
    subject: `Payment overdue: ${c.description}`,
    greeting: `Hi ${c.name},`,
    paragraphs: [
      `We haven’t received your payment of ${c.amount}, due on ${c.dueOn}.`,
      "Please pay it soon so your website and email keep running. If you’ve already paid, you can ignore this email.",
    ],
    button: { label: "Pay now", href: c.payUrl },
  });
}

export function websiteUpdateEmail(c: Customer & { subject: string; message: string; dashboardUrl: string; rows?: [string, string][] }): Email {
  return composeEmail({
    to: c.to,
    subject: c.subject,
    greeting: `Hi ${c.name},`,
    paragraphs: c.message.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean),
    rows: c.rows,
    button: { label: "Open your website page", href: c.dashboardUrl },
  });
}
