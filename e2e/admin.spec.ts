import { expect, test, type Page } from "@playwright/test";
import { LENA_VALUES } from "../src/lib/letter/samples";
import { latestEmailTo, uniqueEmail } from "./support/mailpit";
import { seedCompanies, seedLetter, signInAsNewUser, testAdmin } from "./support/accounts";

// The admin panel. Tests change only their own data: their own companies, payments and reports, and the "XT"
// test country, which has no opening clause, so it never appears in anyone's country list.

async function signInAsAdmin(page: Page, label: string) {
  const account = await signInAsNewUser(page, label, "/dashboard");
  const { error } = await testAdmin().from("profiles").update({ role: "admin" }).eq("id", account.userId);
  if (error) throw new Error(`make admin: ${error.message}`);
  // The first page was rendered before the role changed.
  await page.reload();
  return account;
}

async function testCountry() {
  const { error } = await testAdmin()
    .from("jurisdictions")
    .upsert({ code: "XT", name: "Testland", currency: "EUR", locale: "en-GB", paper_size: "a4", enabled: false, selectable: true, sort_order: 999 }, { onConflict: "code" });
  if (error) throw new Error(`test country: ${error.message}`);
}

const toast = (page: Page, text: string | RegExp) => expect(page.getByRole("region", { name: /Notifications/ }).getByText(text)).toBeVisible();

test("only admins can open the admin panel", async ({ page }) => {
  await signInAsNewUser(page, "not-admin", "/dashboard");
  await page.goto("/admin");
  await page.waitForURL("**/dashboard");
  await expect(page.getByRole("link", { name: "Admin" })).toHaveCount(0);
});

test("an admin's own pages show only their own companies and letters", async ({ page, isMobile }) => {
  const other = await testAdmin().auth.admin.createUser({ email: uniqueEmail("someone-else"), email_confirm: true });
  const [theirs] = await seedCompanies(other.data.user!.id, ["Someone Else GmbH"]);
  const theirLetter = await seedLetter(other.data.user!.id, theirs!.id, { jurisdiction: "DE", values: LENA_VALUES });

  const { userId } = await signInAsAdmin(page, "admin-own-pages");
  await seedCompanies(userId, ["Admin's Own Ltd"]);
  await page.goto("/dashboard");
  await expect(page.getByRole("heading", { name: "No letters yet" })).toBeVisible();
  await page.goto("/companies");
  // The sidebar (behind the menu on phones) counts only their own companies.
  if (!isMobile) await expect(page.getByRole("link", { name: /My companies\s*1 of 5/ })).toBeVisible();
  await expect(page.getByText("Admin's Own Ltd").first()).toBeVisible();
  await expect(page.getByText("Someone Else GmbH")).toHaveCount(0);
  // Someone else's letter doesn't open in an admin's editor or letter page.
  for (const path of [`/letters/${theirLetter}`, `/letters/${theirLetter}/edit`, `/letters/${theirLetter}/checkout`]) {
    const response = await page.goto(path);
    expect(response?.status()).toBe(404);
  }
});

test("the admin panel fits a phone screen", async ({ page, isMobile }) => {
  test.skip(!isMobile, "Phone layout only.");
  await signInAsAdmin(page, "admin-phone");
  for (const path of ["/admin", "/admin/companies", "/admin/payments"]) {
    await page.goto(path);
    await expect(page.locator("main h1")).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  }
});

test.describe("admin", () => {
  test.skip(({ isMobile }) => isMobile, "Admin work is done on a computer; the phone layout is checked above.");

  test("the overview shows the month's numbers and links to everything", async ({ page }) => {
    await signInAsAdmin(page, "admin-overview");
    await page.getByRole("link", { name: "Admin" }).click();
    await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
    for (const label of ["Letters paid", "Revenue", "Draft to paid", "Payments pending"]) await expect(page.getByText(label, { exact: true })).toBeVisible();
    for (const heading of ["Countries", "Misuse reports", "Recent payments", "Prices"]) await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await page.getByLabel("Period").selectOption({ index: 1 });
    await page.waitForURL(/period=\d{4}-\d{2}/);
  });

  test("a clause goes from draft through review to approved", async ({ page }) => {
    await testCountry();
    await signInAsAdmin(page, "admin-clause");
    // Earlier runs leave approved versions (they can't be deleted); unfinished drafts are cleared first.
    await testAdmin().from("clause_variants").update({ review_status: "draft" }).eq("jurisdiction_code", "XT").eq("review_status", "in_review");
    await testAdmin().from("clause_variants").delete().eq("jurisdiction_code", "XT").eq("review_status", "draft");
    await page.goto("/admin/clauses?country=XT&status=all");
    const { data: existing } = await testAdmin().from("clause_variants").select("id").eq("jurisdiction_code", "XT").eq("section_key", "benefits");
    if (existing?.length) {
      await page.getByRole("link", { name: /Benefits/ }).first().click();
      await page.getByRole("button", { name: /Start version \d+/ }).click();
    } else {
      await page.getByRole("button", { name: "New clause variant" }).click();
      await page.getByRole("dialog").getByLabel("Section").selectOption("benefits");
      await page.getByRole("dialog").getByRole("button", { name: "Create draft" }).click();
    }
    await expect(page.getByText(/Version \d+ · Draft/)).toBeVisible();

    const text = page.getByLabel("Clause text");
    await text.fill("You will also receive {{#if benefits.description}}{{benefits.description}}.");
    await expect(page.locator("#clause-check li").first()).toBeVisible();
    await expect(page.getByRole("button", { name: "Save draft" })).toBeDisabled();
    await text.fill("You will also receive {{benefits.description}}. {{candidate.passport}}");
    await expect(page.getByText("{{candidate.passport}} isn’t a field or a built-in value")).toBeVisible();
    // Different on every run: a new version starts from the last approved text, and an unchanged draft can't be saved.
    const body = `You will also receive {{benefits.description}}, as agreed on run ${Date.now()}.`;
    await text.fill(body);
    await expect(page.getByText("1 placeholder, all defined · no conditions · no raw HTML")).toBeVisible();
    await expect(page.getByText(body.replace("{{benefits.description}}", String(LENA_VALUES["benefits.description"])))).toBeVisible();

    await page.getByRole("button", { name: "Save draft" }).click();
    await toast(page, "Draft saved.");
    await page.getByRole("button", { name: "Send for review" }).click();
    await toast(page, /Sent for review/);
    await expect(page.getByText(/Version \d+ · In review/)).toBeVisible();
    await expect(page.getByLabel("Clause text")).toHaveAttribute("readonly", "");

    await page.getByLabel("Reviewer").fill("Test Reviewer, Example LLP");
    await page.getByRole("button", { name: /Approve version \d+/ }).click();
    await toast(page, /approved/);
    await expect(page.getByText(/Version \d+ · Approved/)).toBeVisible();
    await expect(page.getByText("reviewed by Test Reviewer, Example LLP", { exact: false }).first()).toBeVisible();
    const { data: approved } = await testAdmin().from("clause_variants").select("body, reviewer, source_file").eq("jurisdiction_code", "XT").eq("section_key", "benefits").order("version", { ascending: false }).limit(1).single();
    expect(approved).toEqual({ body, reviewer: "Test Reviewer, Example LLP", source_file: null });

    // XT still lacks its required sections, so it can't be switched on.
    await page.goto("/admin/countries");
    await page.getByRole("switch", { name: /Testland: letters off/ }).click();
    await toast(page, /Can’t switch it on yet/);
    const { data: country } = await testAdmin().from("jurisdictions").select("enabled").eq("code", "XT").single();
    expect(country!.enabled).toBe(false);
  });

  test("a company's limit can change and the company can be suspended", async ({ page }) => {
    await signInAsAdmin(page, "admin-companies");
    const owner = uniqueEmail("company-owner");
    const created = await testAdmin().auth.admin.createUser({ email: owner, email_confirm: true });
    const ownerId = created.data.user!.id;
    const name = `Suspicious Hiring ${Date.now()} Ltd`;
    const [company] = await seedCompanies(ownerId, [name]);

    await page.goto("/admin/companies");
    await page.getByRole("searchbox", { name: "Search companies" }).fill("Suspicious Hiring");
    await page.getByRole("searchbox", { name: "Search companies" }).press("Enter");
    await page.getByRole("link", { name }).click();
    await expect(page.getByRole("heading", { name, level: 2 })).toBeVisible();
    await expect(page.getByText("uses 1 of 5 company places")).toBeVisible();

    await page.getByLabel("Company limit").fill("7");
    await page.getByRole("button", { name: "Save limit" }).click();
    await toast(page, "can now save 7 companies");
    await expect(page.getByText("uses 1 of 7 company places")).toBeVisible();

    await page.getByRole("button", { name: "Suspend company" }).click();
    await expect(page.getByText("Give the reason the owner will see")).toBeVisible();
    await page.getByLabel("Reason").fill("A candidate reported being asked for a fee. Suspended while we investigate.");
    await page.getByRole("button", { name: "Suspend company" }).click();
    await toast(page, /is suspended\. We emailed the owner\./);
    const { data: suspended } = await testAdmin().from("companies").select("suspended_at, suspended_reason").eq("id", company!.id).single();
    expect(suspended!.suspended_at).not.toBeNull();
    expect((await latestEmailTo(owner)).Subject).toBe(`${name} is suspended on Offer Letter PDF`);
    await expect(page.getByRole("row", { name: new RegExp(name) }).getByText("Suspended")).toBeVisible();

    await page.getByRole("button", { name: "Lift the suspension" }).click();
    await toast(page, "can make letters again");
    const { data: lifted } = await testAdmin().from("companies").select("suspended_at").eq("id", company!.id).single();
    expect(lifted!.suspended_at).toBeNull();
  });

  test("a misuse report from the public form reaches the admin panel, linked to its company", async ({ page, browser }) => {
    const owner = await testAdmin().auth.admin.createUser({ email: uniqueEmail("reported-owner"), email_confirm: true });
    const name = `Visa Fee Recruiting ${Date.now()} Ltd`;
    const [company] = await seedCompanies(owner.data.user!.id, [name]);
    const txnid = `OLP-20261017-${Math.random().toString(36).slice(2, 8).toUpperCase().replace(/[^A-Z0-9]/g, "Q").padEnd(6, "Q")}`;
    await testAdmin().from("payments").insert({ txnid, user_id: owner.data.user!.id, company_id: company!.id, amount_minor: 79900, currency: "INR" });

    // A candidate, signed out.
    const visitor = await browser.newContext();
    const form = await visitor.newPage();
    await form.goto("/report-misuse");
    await form.getByRole("button", { name: "Send report" }).click();
    await expect(form.getByText("Tell us what happened (at least a sentence).")).toBeVisible();
    await form.getByLabel("What happened?").fill(`They asked me to pay a visa processing fee before my start date (${name}).`);
    await form.getByLabel("Company named in the letter").fill(name);
    await form.getByLabel("Reference, if you have one").fill(txnid);
    await form.getByRole("button", { name: "Send report" }).click();
    await expect(form.getByText("Thank you. We’ve got your report.")).toBeVisible();
    await visitor.close();

    await signInAsAdmin(page, "admin-reports");
    await page.goto("/admin/reports");
    await page.getByRole("link", { name: new RegExp(`visa processing fee.*${name}`) }).click();
    await expect(page.getByRole("link", { name: `Open ${name} (suspend, history)` })).toBeVisible();
    await page.getByLabel("Status").selectOption("investigating");
    await page.getByLabel("Notes for admins").fill("Asked the owner for the original letter.");
    await page.getByRole("button", { name: "Save report" }).click();
    await toast(page, "Report saved.");
    const { data: report } = await testAdmin().from("abuse_reports").select("status, company_id, admin_notes, handled_by").eq("company_name", name).single();
    expect(report).toMatchObject({ status: "investigating", company_id: company!.id, admin_notes: "Asked the owner for the original letter." });
    expect(report!.handled_by).not.toBeNull();

    await page.goto(`/admin/companies?id=${company!.id}`);
    await expect(page.getByText("Open report:")).toBeVisible();
  });

  test("a refund is recorded and ends the letter's free corrections", async ({ page }) => {
    const { userId } = await signInAsAdmin(page, "admin-refund");
    const [company] = await seedCompanies(userId, ["Refund Example GmbH"]);
    const letterId = await seedLetter(userId, company!.id, { jurisdiction: "DE", values: LENA_VALUES });
    const now = Date.now();
    await testAdmin()
      .from("letters")
      .update({ status: "paid", paid_at: new Date(now).toISOString(), correction_until: new Date(now + 7 * 86_400_000).toISOString() })
      .eq("id", letterId);
    const txnid = `OLP-20261017-R${Math.random().toString(36).slice(2, 7).toUpperCase().replace(/[^A-Z0-9]/g, "Q").padEnd(5, "Q")}`;
    await testAdmin()
      .from("payments")
      .insert({ txnid, user_id: userId, company_id: company!.id, letter_id: letterId, amount_minor: 79900, currency: "INR", status: "success", verified_at: new Date(now).toISOString() });

    await page.goto(`/admin/payments?q=${txnid}`);
    await page.getByRole("link", { name: txnid }).click();
    await expect(page.getByRole("heading", { name: txnid })).toBeVisible();
    await page.getByLabel("Refund note").fill("Refunded in PayU, reference RF123456: letter not needed.");
    await page.getByRole("button", { name: "Record refund" }).click();
    await toast(page, `Refund recorded for ${txnid}.`);
    await expect(page.getByText("Refunded", { exact: true }).first()).toBeVisible();

    const { data: payment } = await testAdmin().from("payments").select("status, refund_note, refunded_at").eq("txnid", txnid).single();
    expect(payment).toMatchObject({ status: "refunded", refund_note: "Refunded in PayU, reference RF123456: letter not needed." });
    const { data: letter } = await testAdmin().from("letters").select("correction_until").eq("id", letterId).single();
    expect(new Date(letter!.correction_until!).getTime()).toBeLessThanOrEqual(Date.now());
    const { data: audit } = await testAdmin().from("audit_logs").select("actor_id").eq("action", "refund").eq("entity_type", "payments").order("created_at", { ascending: false }).limit(1).single();
    expect(audit!.actor_id).toBe(userId);
  });

  test("a new price is added switched off, with the price history kept", async ({ page }) => {
    await signInAsAdmin(page, "admin-prices");
    await page.goto("/admin/prices");
    const amount = `${700 + Math.floor(Math.random() * 99)}.00`;
    await page.getByLabel("Amount").fill(amount);
    await page.getByLabel("Notes").fill("e2e: not switched on");
    await page.getByRole("button", { name: "Add price" }).click();
    await toast(page, "Price added.");
    await expect(page.getByRole("row", { name: new RegExp(`₹${amount}.*e2e: not switched on`) }).getByText("Inactive")).toBeVisible();
    // Checkout still uses the active price.
    const { data: active } = await testAdmin().from("prices").select("amount_minor").eq("purpose", "charge").eq("active", true).single();
    expect(active!.amount_minor).toBe(79900);
  });
});
