import { describe, expect, it } from "vitest";
import { composeEmail } from "@/lib/email/layout";
import { isDomain, normalizeDomain, orderErrors, orderSchema } from "./order";
import { addDays, isOverdue, monthEnd, monthLabel, nextDueDate, onboardingPeriod } from "./periods";

describe("billing dates", () => {
  it("knows month ends, including February in leap years", () => {
    expect(monthEnd("2026-10-18")).toBe("2026-10-31");
    expect(monthEnd("2026-11-01")).toBe("2026-11-30");
    expect(monthEnd("2028-02-10")).toBe("2028-02-29");
    expect(monthEnd("2027-02-10")).toBe("2027-02-28");
    expect(monthEnd("2026-12-31")).toBe("2026-12-31");
  });

  it("covers the rest of the month at sign-up, then bills from the 1st", () => {
    expect(onboardingPeriod("2026-10-18")).toEqual({ start: "2026-10-18", end: "2026-10-31" });
    expect(nextDueDate("2026-10-31")).toBe("2026-11-01");
    expect(nextDueDate("2026-12-31")).toBe("2027-01-01");
    expect(nextDueDate(null)).toBeNull();
  });

  it("is overdue a week after the due date", () => {
    expect(isOverdue("2026-11-01", "2026-11-07")).toBe(false);
    expect(isOverdue("2026-11-01", "2026-11-08")).toBe(true);
    expect(addDays("2026-12-29", 5)).toBe("2027-01-03");
    expect(monthLabel("2026-11-01")).toBe("November 2026");
  });
});

describe("website orders", () => {
  const valid = {
    companyId: "0f8fad5b-d9cb-469f-a165-70867728950e",
    domains: ["https://www.Sharma-Bakery.in/", "sharmabakery.com", ""],
    mailboxName: " Info ",
    about: "We bake fresh bread and cakes in Jaipur and deliver across the city.",
    pages: ["Home", "Contact"],
    references: "",
    contactPhone: "+91 98765 43210",
  };

  it("cleans up domains people paste", () => {
    expect(normalizeDomain(" HTTPS://www.My-Bakery.in/menu?x=1 ")).toBe("my-bakery.in");
    expect(isDomain("my-bakery.in")).toBe(true);
    expect(isDomain("my_bakery.in")).toBe(false);
    expect(isDomain("bakery")).toBe(false);
    expect(isDomain("-bakery.in")).toBe(false);
  });

  it("accepts a complete order, normalised", () => {
    const order = orderSchema.parse(valid);
    expect(order.domains).toEqual(["sharma-bakery.in", "sharmabakery.com"]);
    expect(order.mailboxName).toBe("info");
  });

  it("says what's missing, field by field", () => {
    const result = orderSchema.safeParse({ ...valid, companyId: "", domains: ["", "not a domain"], mailboxName: "info@", about: "Bread", contactPhone: "call me" });
    expect(result.success).toBe(false);
    expect(orderErrors(result.error!)).toMatchObject({
      companyId: "Choose the business this website is for.",
      domains: "Enter domains like mybusiness.in or mybusiness.com.",
      mailboxName: "Use letters, numbers, dots or dashes, like info or anita.",
      about: "Tell us about the business in a few sentences.",
      contactPhone: "Enter a phone number like +91 98765 43210.",
    });
    expect(orderSchema.safeParse({ ...valid, domains: ["", " "] }).error?.issues[0]?.message).toBe("Enter at least one domain you’d like.");
    expect(orderSchema.safeParse({ ...valid, domains: ["a.in", "b.in", "c.in", "d.in"] }).error?.issues[0]?.message).toBe("Give us up to three domains.");
  });
});

describe("emails", () => {
  it("escapes everything in the HTML and keeps a text version", () => {
    const email = composeEmail({
      to: "anita@example.in",
      subject: "Update",
      greeting: "Hi <Anita>,",
      paragraphs: ["Your site & email are ready."],
      rows: [["Website", "https://x.in/?a=1&b=2"]],
      button: { label: "Open", href: "https://x.in/website/1" },
    });
    expect(email.html).toContain("Hi &lt;Anita&gt;,");
    expect(email.html).toContain("Your site &amp; email are ready.");
    expect(email.html).not.toContain("<Anita>");
    expect(email.text).toContain("Website: https://x.in/?a=1&b=2");
    expect(email.text).toContain("Open: https://x.in/website/1");
    expect(email.text.trim().endsWith("AI Company Wala")).toBe(true);
  });
});
