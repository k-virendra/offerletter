import { expect, test, type Page } from "@playwright/test";
import { extractText, getDocumentProxy } from "unpdf";
import { LENA_VALUES } from "../src/lib/letter/samples";
import { seedCompanies, seedLetter, signInAsNewUser, testAdmin } from "./support/accounts";

// Payments against the local PayU simulator (PAYU_MODE=simulator): it checks the request hash, posts a signed
// response back to the app, sends the webhook a moment later and answers verify_payment, so the real checks run.

const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://127.0.0.1:56324";
const OUTCOME = { success: "Pay by card — success", pending: /Bank transfer — pending/, failure: "Card declined — failure" } as const;

async function newLetter(page: Page, label: string) {
  const { userId, email } = await signInAsNewUser(page, label, "/dashboard");
  const [company] = await seedCompanies(userId, ["Example Engineering GmbH"]);
  const letterId = await seedLetter(userId, company!.id, { jurisdiction: "DE", values: LENA_VALUES, name: "Lena Hoffmann – Senior Backend Engineer" });
  return { userId, email, letterId };
}

/** Checkout through the simulator. Returns the transaction id from the status page's address. */
async function pay(page: Page, letterId: string, outcome: keyof typeof OUTCOME) {
  if (!page.url().includes(`/letters/${letterId}/checkout`)) await page.goto(`/letters/${letterId}/checkout`);
  await expect(page.getByRole("heading", { name: "Checkout", exact: true })).toBeVisible();
  await page.getByLabel("Full name").fill("Anna Weber");
  await page.getByLabel("Postal code").fill("80331");
  await page.getByRole("checkbox", { name: /authorised to issue this letter/ }).check();
  await page.getByRole("button", { name: "Pay ₹799.00 with PayU" }).click();
  await expect(page.getByText("TEST MODE · simulator")).toBeVisible();
  await expect(page.getByText("₹799.00")).toBeVisible();
  await page.getByRole("button", { name: OUTCOME[outcome] }).click();
  await page.waitForURL(new RegExp(`/letters/${letterId}/checkout/OLP-`), { timeout: 60_000 });
  return decodeURIComponent(new URL(page.url()).pathname.split("/").pop()!);
}

async function payment(txnid: string) {
  const { data } = await testAdmin().from("payments").select("status, failure_reason, raw_responses, receipt_sent_at, verified_at").eq("txnid", txnid).single();
  return data!;
}

async function versions(letterId: string) {
  const { data } = await testAdmin().from("letter_versions").select("version, pdf_path, note").eq("letter_id", letterId).order("version");
  return data ?? [];
}

const ready = (page: Page) => expect(page.getByRole("heading", { name: "Payment received. Your letter is ready." })).toBeVisible({ timeout: 60_000 });

test("paying issues the letter once, with its PDF and one receipt", async ({ page, isMobile }) => {
  const { email, letterId } = await newLetter(page, "pay-success");

  await page.goto(`/letters/${letterId}/edit`);
  await page.getByRole("button", { name: "Pay & download · ₹799" }).click();
  await page.waitForURL(`**/letters/${letterId}/checkout`);
  await expect(page.getByText("Free corrections until")).toBeVisible();
  await expect(page.getByText("Charged in Indian rupees.", { exact: false })).toBeVisible();

  // Details are checked before anything is sent.
  await page.getByRole("button", { name: "Pay ₹799.00 with PayU" }).click();
  await expect(page.getByText("Confirm that you may issue this letter for the company.")).toBeVisible();
  await expect(page.getByLabel("Full name")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Full name")).toBeFocused();
  await expect(page.getByLabel("Postal code")).toHaveAttribute("aria-invalid", "true");

  const txnid = await pay(page, letterId, "success");
  await ready(page);
  await expect(page.getByText(txnid)).toBeVisible();

  // The webhook arrives a moment after the browser: the same payment is completed twice, but issued once.
  await expect.poll(async () => JSON.stringify((await payment(txnid)).raw_responses), { timeout: 15_000 }).toContain('"received_from":"webhook"');
  const paid = await payment(txnid);
  expect(paid.status).toBe("success");
  expect(paid.receipt_sent_at).not.toBeNull();
  expect(JSON.stringify(paid.raw_responses)).toContain('"received_from":"return"');
  // Card details in PayU's response are never stored.
  expect(JSON.stringify(paid.raw_responses)).not.toMatch(/512345|name_on_card|cardnum/);
  expect(await versions(letterId)).toEqual([expect.objectContaining({ version: 1, note: "Original, after payment", pdf_path: expect.stringMatching(/\/v1-[0-9a-f]{12}\.pdf$/) })]);
  const { data: letter } = await testAdmin().from("letters").select("status, current_version, correction_until").eq("id", letterId).single();
  expect(letter).toMatchObject({ status: "paid", current_version: 1 });
  const days = (new Date(letter!.correction_until!).getTime() - Date.now()) / 86_400_000;
  expect(days).toBeGreaterThan(6.9);
  expect(days).toBeLessThan(7.01);

  // One receipt, in the local inbox.
  await expect
    .poll(async () => {
      const res = await fetch(`${MAILPIT_URL}/api/v1/search?query=${encodeURIComponent(`to:"${email}"`)}`);
      const body = (await res.json()) as { messages: { Subject: string }[] };
      return body.messages.map((m) => m.Subject);
    })
    .toEqual([`Your receipt for Lena Hoffmann – Senior Backend Engineer (${txnid})`]);

  if (!isMobile) {
    // The final PDF, without the preview watermark.
    const response = await page.request.get(`/api/letters/${letterId}/versions/1/pdf`);
    expect(response.status()).toBe(200);
    expect(response.headers()["content-type"]).toBe("application/pdf");
    const { text } = await extractText(await getDocumentProxy(new Uint8Array(await response.body())), { mergePages: true });
    expect(text).toContain("Lena Hoffmann");
    expect(text.toLowerCase()).not.toContain("preview");
  }

  // The letter's page, and its receipt.
  await page.getByRole("link", { name: "Open the letter" }).click();
  await page.waitForURL(`**/letters/${letterId}`);
  await expect(page.getByText("Paid · version 1")).toBeVisible();
  await expect(page.getByText(/Fingerprint [0-9a-f]{4} [0-9a-f]{4}/)).toBeVisible();
  await expect(page.getByText("Original, after payment", { exact: false })).toBeVisible();
  await expect(page.getByText(/7 days left|6 days left/)).toBeVisible();
  await page.getByRole("link", { name: "View the receipt" }).click();
  await expect(page.getByRole("heading", { name: "Receipt" })).toBeVisible();
  await expect(page.getByText(txnid).first()).toBeVisible();
  await expect(page.getByRole("row", { name: /Total ₹799\.00/ })).toBeVisible();

  // A paid letter can't go through checkout again.
  await page.goto(`/letters/${letterId}/checkout`);
  await page.waitForURL(`**/letters/${letterId}`);
});

test.describe("payment outcomes", () => {
  test.skip(({ isMobile }) => isMobile, "Covered once; the phone layout is checked in the first test.");

  test("a pending payment confirms itself while the page is open", async ({ page }) => {
    const { letterId } = await newLetter(page, "pay-pending");
    const txnid = await pay(page, letterId, "pending");
    await expect(page.getByRole("heading", { name: "We’re confirming your payment" })).toBeVisible();
    await expect(page.getByText(/Checking again in \d+ s/)).toBeVisible();
    expect((await payment(txnid)).status).toBe("pending");
    // The simulator settles after 10 s; the page asks every 12 s.
    await ready(page);
    expect((await payment(txnid)).status).toBe("success");
  });

  test("a declined payment says why, keeps the draft and can be tried again", async ({ page }) => {
    const { letterId } = await newLetter(page, "pay-failed");
    const txnid = await pay(page, letterId, "failure");
    await expect(page.getByRole("heading", { name: "The payment didn’t go through" })).toBeVisible();
    await expect(page.getByText("Your bank declined the payment.")).toBeVisible();
    expect(await payment(txnid)).toMatchObject({ status: "failed", failure_reason: "Your bank declined the payment." });

    // A forged "success" (no valid hash) changes nothing.
    const forged = await page.request.post("/api/payu/webhook", {
      form: { key: "olpsimkey", txnid, amount: "799.00", status: "success", mihpayid: "1", hash: "0".repeat(128) },
    });
    expect(forged.status()).toBe(200);
    await page.waitForTimeout(1_000);
    expect((await payment(txnid)).status).toBe("failed");
    const { data: letter } = await testAdmin().from("letters").select("status").eq("id", letterId).single();
    expect(letter!.status).toBe("draft");

    await page.getByRole("link", { name: "Try again" }).click();
    await page.waitForURL(`**/letters/${letterId}/checkout`);
    await expect(page.getByRole("heading", { name: "Checkout", exact: true })).toBeVisible();
  });

  test("the recheck job confirms payments nobody came back for and closes abandoned ones", async ({ page }) => {
    const unauthorised = await page.request.get("/api/cron/payu-recheck");
    expect(unauthorised.status()).toBe(401);

    const { userId, letterId } = await newLetter(page, "pay-recheck");
    const txnid = await pay(page, letterId, "pending");
    await expect(page.getByRole("heading", { name: "We’re confirming your payment" })).toBeVisible();
    // The customer leaves before PayU confirms.
    await page.goto("/dashboard");
    await page.waitForTimeout(11_000);
    const fifteenMinutesAgo = new Date(Date.now() - 20 * 60_000).toISOString();
    await testAdmin().from("payments").update({ created_at: fifteenMinutesAgo }).eq("txnid", txnid);

    const abandoned = `OLP-E2E-${Date.now().toString(36).toUpperCase()}`;
    await testAdmin()
      .from("payments")
      .insert({ txnid: abandoned, user_id: userId, amount_minor: 79900, currency: "INR", created_at: new Date(Date.now() - 25 * 60 * 60_000).toISOString() });

    const response = await page.request.get("/api/cron/payu-recheck", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` }, timeout: 120_000 });
    expect(response.status()).toBe(200);
    expect((await payment(txnid)).status).toBe("success");
    expect(await versions(letterId)).toEqual([expect.objectContaining({ version: 1, pdf_path: expect.any(String) })]);
    expect(await payment(abandoned)).toMatchObject({ status: "failed", failure_reason: "Checkout was not completed." });
  });

  test("a free correction issues version 2 and keeps the candidate and the job", async ({ page }) => {
    const { letterId } = await newLetter(page, "pay-correct");
    await pay(page, letterId, "success");
    await ready(page);

    await page.goto(`/letters/${letterId}`);
    await page.getByRole("link", { name: "Correct a mistake" }).first().click();
    await page.waitForURL(`**/letters/${letterId}/edit`);
    await expect(page.getByText("Correcting version 1")).toBeVisible();
    await expect(page.locator("#field-candidate-full_name")).toHaveAttribute("readonly", "");
    await expect(page.locator("#field-position-job_title")).toHaveAttribute("readonly", "");
    await expect(page.getByRole("button", { name: /Change country/ })).toHaveCount(0);

    // Nothing to issue yet.
    const unchanged = await page.request.post(`/api/letters/${letterId}/corrections`, { headers: { origin: new URL(page.url()).origin } });
    expect(unchanged.status()).toBe(409);
    expect((await unchanged.json()).error).toContain("Nothing has changed since version 1");

    await page.locator("#field-position-start_date").fill("2027-01-04");
    await page.locator("#field-position-start_date").blur();
    await expect(page.getByText("All changes saved")).toBeVisible();
    await page.getByRole("button", { name: "Issue corrected version" }).click();
    await page.getByRole("alertdialog").getByRole("button", { name: "Issue version 2" }).click();
    await page.waitForURL(`**/letters/${letterId}`, { timeout: 60_000 });
    await expect(page.getByText("Paid · version 2")).toBeVisible();
    await expect(page.getByText("Corrected: Start date", { exact: false })).toBeVisible();
    expect((await versions(letterId)).map((v) => v.version)).toEqual([1, 2]);

    // Once the free period is over, the editor is closed.
    await testAdmin().from("letters").update({ correction_until: new Date(Date.now() - 60_000).toISOString() }).eq("id", letterId);
    await page.goto(`/letters/${letterId}/edit`);
    await page.waitForURL(`**/letters/${letterId}`);
    await expect(page.getByText(/The free correction period ended/)).toBeVisible();
  });
});
