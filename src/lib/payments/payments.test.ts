import { describe, expect, it } from "vitest";
import { receiptEmail } from "@/lib/email/receipt";
import { changedLockedField, correctionChanges, correctionNote, keepLockedFields } from "@/lib/letter/corrections";
import { LENA_VALUES } from "@/lib/letter/samples";
import { contextFor } from "@/lib/letter/test-context";
import type { LetterState } from "@/lib/letter/types";
import { fingerprint } from "@/lib/pdf/snapshot";
import { billingRecord, billingSchema, failureReason } from "./billing";

const BILLING = { fullName: "Anna Weber", email: "anna@example.de", companyName: "", country: "DE", postalCode: "80331", address: "", authorised: true };

describe("billing details", () => {
  it("accepts complete details and trims them", () => {
    const parsed = billingSchema.parse({ ...BILLING, fullName: "  Anna Weber ", email: " anna@example.de " });
    expect(parsed).toMatchObject({ fullName: "Anna Weber", email: "anna@example.de", country: "DE" });
  });

  it("explains what's wrong, field by field", () => {
    const result = billingSchema.safeParse({ ...BILLING, fullName: " ", email: "anna@", country: "XX", postalCode: "", authorised: false });
    expect(result.success).toBe(false);
    const messages = Object.fromEntries(result.error!.issues.map((issue) => [issue.path[0], issue.message]));
    expect(messages).toMatchObject({
      fullName: "Enter the name of the person paying.",
      email: "Enter an email address like name@company.com.",
      country: "Choose a country.",
      postalCode: "Enter the postal code of the billing address.",
      authorised: "Confirm that you may issue this letter for the company.",
    });
  });

  it("stores when the payer confirmed their authority, not the checkbox", () => {
    const record = billingRecord(billingSchema.parse(BILLING), new Date("2026-10-17T10:00:00Z"));
    expect(record).toMatchObject({ fullName: "Anna Weber", authorised_at: "2026-10-17T10:00:00.000Z" });
    expect(record).not.toHaveProperty("authorised");
  });
});

describe("failure reasons", () => {
  it("turns PayU's codes into plain words", () => {
    expect(failureReason({ unmappedStatus: "userCancelled", message: "User cancelled" })).toBe("The payment was cancelled before it finished.");
    expect(failureReason({ message: "Card declined by the issuing bank" })).toBe("Your bank declined the payment.");
    expect(failureReason({ message: "Insufficient funds" })).toBe("Your bank says there weren’t enough funds.");
    expect(failureReason({ message: "3DS authentication failed" })).toBe("The bank’s security check didn’t finish.");
    expect(failureReason({ message: "E1605" })).toBe("PayU couldn’t complete the payment.");
    expect(failureReason({})).toBe("PayU couldn’t complete the payment.");
  });
});

describe("receipt email", () => {
  const details = {
    to: "anna@example.de",
    name: "Anna <Weber>",
    reference: "OLP-20261017-7Q4K2M",
    paidOn: "17 October 2026",
    price: "US$9.00",
    charged: "₹799.00",
    letterName: "Offer for Lena Hoffmann",
    companyName: "Example & Co GmbH",
    letterUrl: "https://offerletter.example/letters/1",
    receiptUrl: "https://offerletter.example/receipts/OLP-20261017-7Q4K2M",
    correctionsUntil: "24 October 2026",
  };

  it("has the reference, both amounts and the links", () => {
    const email = receiptEmail(details);
    expect(email.subject).toBe("Your receipt for Offer for Lena Hoffmann (OLP-20261017-7Q4K2M)");
    expect(email.text).toContain("Amount: US$9.00 (charged by PayU as ₹799.00)");
    expect(email.text).toContain("Receipt: https://offerletter.example/receipts/OLP-20261017-7Q4K2M");
    expect(email.html).toContain('href="https://offerletter.example/letters/1"');
  });

  it("escapes names in the HTML", () => {
    const email = receiptEmail(details);
    expect(email.html).toContain("Hi Anna &lt;Weber&gt;,");
    expect(email.html).toContain("Example &amp; Co GmbH");
    expect(email.html).not.toContain("<Weber>");
  });

  it("shows one amount when the charge is in the displayed currency", () => {
    expect(receiptEmail({ ...details, charged: "US$9.00" }).text).toContain("Amount: US$9.00\n");
  });
});

describe("corrections", () => {
  const context = contextFor("DE");
  const issued: LetterState = { name: "Offer", templateKey: "classic", accentColor: null, values: { ...LENA_VALUES }, removedSections: [] };

  it("locks the candidate's name and the job title", () => {
    expect(changedLockedField(issued.values, { ...issued.values, "position.start_date": "2027-01-04" })).toBeNull();
    expect(changedLockedField(issued.values, { ...issued.values, "candidate.full_name": "Lena Hofmann" })).toBe("candidate.full_name");
    expect(changedLockedField(issued.values, { ...issued.values, "position.job_title": "Staff Engineer" })).toBe("position.job_title");
    expect(changedLockedField({ ...issued.values, "position.job_title": "" }, { ...issued.values, "position.job_title": undefined as never })).toBeNull();
    expect(keepLockedFields(issued.values, { ...issued.values, "candidate.full_name": "Someone else" })["candidate.full_name"]).toBe("Lena Hoffmann");
  });

  it("lists what changed, for the version history", () => {
    const corrected: LetterState = {
      ...issued,
      templateKey: "modern",
      values: { ...issued.values, "position.start_date": "2027-01-04", "pay.base_amount": "80000", "candidate.address": "" },
      removedSections: ["relocation"],
    };
    const changes = correctionChanges(context, issued, corrected, true);
    expect(changes).toEqual(expect.arrayContaining(["Start date", "Letter style", "Company details"]));
    expect(changes.some((change) => change.endsWith("removed"))).toBe(true);
    expect(correctionChanges(context, issued, { ...issued, name: "Renamed" })).toEqual([]);
    expect(correctionNote(["Start date", "Salary"])).toBe("Corrected: Start date, Salary");
    expect(correctionNote(Array.from({ length: 80 }, (_, i) => `Field number ${i}`))).toHaveLength(299);
  });

  it("shows a short, grouped fingerprint", () => {
    expect(fingerprint("9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2b0b822cd15d6c15b0f00a08")).toBe("9f86 d081 884c");
  });
});
