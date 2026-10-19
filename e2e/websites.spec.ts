import { expect, test, type Browser, type Page } from "@playwright/test";
import { formatDay, todayIso } from "../src/lib/template/format";
import { addDays, monthEnd, nextDueDate } from "../src/lib/websites/periods";
import { latestEmailTo } from "./support/mailpit";
import { seedCompanies, signInAsNewUser, testAdmin } from "./support/accounts";

// Business websites, end to end with the PayU simulator: order and pay onboarding, the team sets it up and
// activates it, the billing job issues the next month's invoice and marks it overdue, the customer pays it, the
// team adds a one-off charge, and the customer asks to cancel. Serial: the billing job moves every subscription's
// clock, so nothing else may run alongside it.

test.describe.configure({ mode: "serial" });

const toast = (page: Page, text: string | RegExp) => expect(page.getByRole("region", { name: /Notifications/ }).getByText(text)).toBeVisible();

async function payWithSimulator(page: Page, button: string | RegExp) {
  await page.getByRole("button", { name: button }).click();
  await expect(page.getByText("TEST MODE · simulator")).toBeVisible();
  await page.getByRole("button", { name: "Pay by card — success" }).click();
  await page.waitForURL(/\/website\/payments\/OLP-/, { timeout: 60_000 });
  await expect(page.getByRole("heading", { name: "Payment received. Thank you!" })).toBeVisible();
}

async function adminPage(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  const account = await signInAsNewUser(page, "website-admin", "/dashboard");
  await testAdmin().from("profiles").update({ role: "admin" }).eq("id", account.userId);
  return page;
}

const runBilling = (page: Page, today: string) =>
  page.request.get(`/api/cron/billing?today=${today}`, { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` }, timeout: 120_000 });

test.describe("a website, from order to cancellation", () => {
  test.skip(({ isMobile }) => isMobile, "The lifecycle runs once; the phone layout is checked in its own test.");

  let customer: Page;
  let email = "";
  let subscriptionId = "";
  const domain = `sharma-bakery-${Date.now().toString(36)}.in`;
  const business = `Sharma Bakery ${Date.now().toString(36)} Pvt Ltd`;

  test("a customer orders a website and pays the onboarding fee", async ({ browser }) => {
    customer = await (await browser.newContext()).newPage();
    const account = await signInAsNewUser(customer, "website-customer", "/dashboard");
    email = account.email;
    await seedCompanies(account.userId, [business]);

    await customer.getByRole("link", { name: "Website" }).first().click();
    await expect(customer.getByRole("heading", { name: "Business website", level: 1 })).toBeVisible();
    await expect(customer.getByText("₹4,999.00").first()).toBeVisible();
    await customer.getByRole("link", { name: "Get started" }).click();
    await customer.waitForURL("**/website/new");

    // Checked before anything is sent.
    await customer.getByRole("button", { name: "Pay ₹4,999.00 with PayU" }).click();
    await expect(customer.getByText("Enter at least one domain you’d like.")).toBeVisible();
    await expect(customer.getByLabel("Domain you’d like most")).toBeFocused();

    await customer.getByLabel("Domain you’d like most").fill(`https://www.${domain}/`);
    await customer.getByLabel("Second choice").fill(domain.replace(".in", ".com"));
    await customer.getByLabel("What does your business do?").fill("We bake fresh bread, cakes and cookies in Jaipur and deliver across the city every morning.");
    await customer.getByLabel("Phone or WhatsApp number").fill("+91 98765 43210");
    await expect(customer.getByText(`@${domain}`)).toBeVisible();
    await customer.getByLabel("Full name").fill("Anita Sharma");
    await customer.getByLabel("Postal code").fill("302001");
    await customer.getByRole("checkbox", { name: /I agree to the Terms/ }).check();
    await payWithSimulator(customer, "Pay ₹4,999.00 with PayU");

    await customer.getByRole("link", { name: "Open your website page" }).click();
    await customer.waitForURL(/\/website\/[0-9a-f-]{36}$/);
    subscriptionId = new URL(customer.url()).pathname.split("/").pop()!;
    await expect(customer.getByText("Being set up").first()).toBeVisible();
    await expect(customer.getByText(`Due ${formatDay(nextDueDate(monthEnd(todayIso()))!)}`)).toBeVisible();
    await expect(customer.getByRole("link", { name: "Receipt" })).toBeVisible();

    const { data: s } = await testAdmin().from("subscriptions").select("status, paid_through, requested_domains, mailbox_name").eq("id", subscriptionId).single();
    expect(s).toMatchObject({ status: "onboarding", paid_through: monthEnd(todayIso()), mailbox_name: "info" });
    expect(s!.requested_domains).toEqual([domain, domain.replace(".in", ".com")]);
    // The webhook arrives too: the invoice is still paid once, and there's one "order received" email.
    const { data: invoice } = await testAdmin().from("invoices").select("id, status").eq("subscription_id", subscriptionId).eq("kind", "onboarding").single();
    expect(invoice!.status).toBe("paid");
    await expect
      .poll(async () => JSON.stringify((await testAdmin().from("payments").select("raw_responses").eq("invoice_id", invoice!.id).eq("status", "success").single()).data?.raw_responses), { timeout: 15_000 })
      .toContain('"received_from":"webhook"');
    expect((await latestEmailTo(email)).Subject).toBe("We’ve received your website order");
  });

  test("the team sets it up and activates it", async ({ browser }) => {
    const admin = await adminPage(browser);
    await admin.goto(`/admin/websites?status=setup&id=${subscriptionId}`);
    await expect(admin.getByRole("heading", { name: business, level: 2 })).toBeVisible();
    await expect(admin.getByRole("button", { name: "Activate and tell the customer" })).toBeDisabled();

    await admin.getByLabel("Registered until").fill(addDays(todayIso(), 365));
    await admin.getByLabel("Registrar").fill("Test Registrar");
    await admin.getByLabel("What it cost (₹)").fill("899");
    await admin.getByRole("button", { name: "Mark domain registered" }).click();
    await toast(admin, "Domain marked as registered. The customer was told.");
    expect((await latestEmailTo(email)).Subject).toBe(`Your domain ${domain} is registered`);

    await admin.getByLabel("Website address").fill(`https://${domain}`);
    await admin.getByRole("button", { name: "Mark website live" }).click();
    await toast(admin, "Website marked as live. The customer was told.");

    await admin.getByLabel("Email provider").fill("Zoho Mail");
    await admin.getByRole("button", { name: "Mark email ready" }).click();
    await toast(admin, "Mailbox marked as ready. The customer was told.");

    await admin.getByRole("button", { name: "Activate and tell the customer" }).click();
    await toast(admin, "Activated. The customer was emailed.");
    expect((await latestEmailTo(email)).Subject).toBe("Your website, domain and email are ready");

    const { data: s } = await testAdmin().from("subscriptions").select("status, domain, website_url, mailbox_address").eq("id", subscriptionId).single();
    expect(s).toEqual({ status: "active", domain, website_url: `https://${domain}`, mailbox_address: `info@${domain}` });
    // The registrar and cost stay with the team.
    const { data: secret } = await testAdmin().from("subscription_private").select("registrar, domain_cost_minor").eq("subscription_id", subscriptionId).single();
    expect(secret).toEqual({ registrar: "Test Registrar", domain_cost_minor: 89900 });

    await customer.reload();
    await expect(customer.getByText("Active").first()).toBeVisible();
    await expect(customer.getByRole("link", { name: domain })).toHaveAttribute("href", `https://${domain}`);
    await expect(customer.getByText(`info@${domain}`).first()).toBeVisible();
    await admin.context().close();
  });

  test("monthly invoices are issued, fall overdue and are paid from the website page", async () => {
    const unauthorised = await customer.request.get("/api/cron/billing");
    expect(unauthorised.status()).toBe(401);

    const first = nextDueDate(monthEnd(todayIso()))!;
    expect((await runBilling(customer, addDays(first, -6))).status()).toBe(200);
    expect((await testAdmin().from("invoices").select("id").eq("subscription_id", subscriptionId).eq("kind", "monthly")).data).toHaveLength(0);
    expect((await runBilling(customer, addDays(first, -5))).status()).toBe(200);
    const { data: monthly } = await testAdmin().from("invoices").select("id, due_on, amount_minor, status").eq("subscription_id", subscriptionId).eq("kind", "monthly");
    expect(monthly).toEqual([expect.objectContaining({ due_on: first, amount_minor: 499900, status: "open" })]);
    expect((await latestEmailTo(email)).Subject).toMatch(/^Your invoice: Business website – /);

    // A week after the 1st it's overdue.
    await runBilling(customer, addDays(first, 7));
    expect((await testAdmin().from("subscriptions").select("status").eq("id", subscriptionId).single()).data!.status).toBe("past_due");
    expect((await latestEmailTo(email)).Subject).toMatch(/^Payment overdue: /);

    await customer.reload();
    await expect(customer.getByRole("status").filter({ hasText: "A payment is overdue." })).toBeVisible();
    await customer.getByRole("link", { name: "Pay now" }).first().click();
    await customer.waitForURL(/\/website\/invoices\/[0-9a-f-]+\/pay$/);
    await expect(customer.getByLabel("Full name")).toHaveValue("Anita Sharma");
    await customer.getByRole("checkbox", { name: /I agree to the Terms/ }).check();
    await payWithSimulator(customer, "Pay ₹4,999.00 with PayU");

    const { data: s } = await testAdmin().from("subscriptions").select("status, paid_through").eq("id", subscriptionId).single();
    expect(s).toEqual({ status: "active", paid_through: monthEnd(first) });
  });

  test("the team adds a one-off charge and records it as paid; the customer asks to cancel", async ({ browser }) => {
    const admin = await adminPage(browser);
    await admin.goto(`/admin/websites?status=all&id=${subscriptionId}`);
    await admin.getByLabel("Extra charge for").fill("Domain above ₹1,499 (first year)");
    await admin.getByLabel("Amount (₹)").fill("500");
    await admin.getByRole("button", { name: "Add invoice" }).click();
    await toast(admin, "Invoice added and emailed to the customer.");

    await customer.goto(`/website/${subscriptionId}`);
    await expect(customer.getByRole("region", { name: "Billing" }).getByText("Domain above ₹1,499 (first year)")).toBeVisible();

    const { data: oneOff } = await testAdmin().from("invoices").select("id, number").eq("subscription_id", subscriptionId).eq("kind", "one_off").single();
    await admin.getByRole("button", { name: `Mark ${oneOff!.number} as paid` }).click();
    await admin.getByLabel("How it was paid").fill("Bank transfer UTR 1234567890");
    await admin.getByRole("button", { name: "Mark as paid" }).click();
    await toast(admin, "Invoice marked as paid.");
    expect((await testAdmin().from("invoices").select("status, note").eq("id", oneOff!.id).single()).data).toEqual({ status: "paid", note: "Paid outside PayU: Bank transfer UTR 1234567890" });

    await customer.reload();
    await customer.getByRole("button", { name: "Ask to cancel" }).click();
    await customer.getByRole("alertdialog").getByRole("button", { name: "Ask to cancel" }).click();
    await toast(customer, "We’ve received your request. Our team will contact you to confirm.");
    await admin.reload();
    await expect(admin.getByText(/Asked to cancel on/)).toBeVisible();

    // Billing is run by hand from the overview (today's run issues nothing more for this plan: it's paid ahead).
    await admin.goto("/admin");
    await admin.getByRole("button", { name: "Run billing" }).click();
    await toast(admin, /^Billing done: /);
    await expect(admin.getByText(/Last run .* by e2e-website-admin/)).toBeVisible();
    await admin.context().close();
  });
});

test.describe("on a phone", () => {
  test.skip(({ isMobile }) => !isMobile, "Phone only.");
  test("the website pages fit the screen", async ({ page }) => {
    const { userId } = await signInAsNewUser(page, "website-phone", "/dashboard");
    await seedCompanies(userId, ["Phone Test Traders"]);
    for (const path of ["/website", "/website/new"]) {
      await page.goto(path);
      await expect(page.locator("h1")).toBeVisible();
      expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
    }
  });
});
