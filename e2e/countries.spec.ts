import { expect, test, type Page } from "@playwright/test";
import { seedCompanies, signInAsNewUser, testAdmin } from "./support/accounts";

// Country packs: a letter uses the wording for where its company is (country, and state or province in the US and
// Canada). Every launch country opens with its own wording, places without wording say so, and a draft follows its
// company when the company moves, keeping the answers that still apply.

const toastText = (page: Page, text: string | RegExp) => page.getByRole("region", { name: /Notifications/ }).getByText(text);
const form = (page: Page) => page.getByRole("region", { name: "Letter details" });
const preview = (page: Page) => page.getByRole("region", { name: "Letter preview" });

async function newLetterFor(page: Page, companyId: string) {
  await page.goto(`/letters/new?company=${companyId}`);
  await page.getByRole("button", { name: "Continue to details" }).click();
  await page.waitForURL(/\/edit$/);
}

const SWEEP: { country: string; region?: string; chip: string; locked: [string, string][] }[] = [
  { country: "DE", chip: "Germany", locked: [["Notice periods", "Required in Germany"], ["Written terms of employment", "Required in Germany"]] },
  { country: "IE", chip: "Ireland", locked: [["Written terms of employment", "Required in Ireland"]] },
  { country: "NL", chip: "Netherlands", locked: [["Your role and start date", "Included in every letter"]] },
  { country: "GB", chip: "United Kingdom", locked: [["Pension", "Included in every UK letter"], ["Written terms of employment", "Required in the United Kingdom"]] },
  { country: "AU", chip: "Australia", locked: [["Superannuation", "Included in every Australian letter"], ["Information statements", "Required in Australia"]] },
  { country: "NZ", chip: "New Zealand", locked: [["KiwiSaver", "Included in every New Zealand letter"], ["Your right to seek advice", "Required in New Zealand"]] },
  { country: "CA", region: "CA-ON", chip: "Canada, Ontario", locked: [["Compensation", "Included in every letter"]] },
  { country: "CA", region: "CA-BC", chip: "Canada, British Columbia", locked: [["Compensation", "Included in every letter"]] },
  { country: "CA", region: "CA-AB", chip: "Canada, Alberta", locked: [["Compensation", "Included in every letter"]] },
  { country: "US", region: "US-CA", chip: "United States, California", locked: [["At-will employment", "Included in every US letter"], ["Wage notice", "Required in California"]] },
  { country: "US", region: "US-NY", chip: "United States, New York", locked: [["Pay notice", "Required in New York"]] },
  { country: "US", region: "US-TX", chip: "United States", locked: [["At-will employment", "Included in every US letter"]] },
];

for (const { country, region, chip, locked } of SWEEP) {
  test(`${region ?? country} companies' letters open with their own wording`, async ({ page, isMobile }) => {
    test.skip(isMobile, "One pass per country is enough; the phone layout is covered elsewhere.");
    const { userId } = await signInAsNewUser(page, `sweep-${(region ?? country).toLowerCase()}`, "/letters/new");
    const [company] = await seedCompanies(userId, ["Example Engineering"], { country_code: country, region_code: region ?? null });
    await newLetterFor(page, company!.id);
    await expect(form(page).getByText(chip, { exact: true })).toBeVisible();
    for (const [section, reason] of locked) {
      await expect(form(page).getByRole("article", { name: section, exact: true }), `${chip}: ${section}`).toContainText(reason);
    }
    await expect(preview(page).getByRole("group", { name: /^Letter, page 1 of/ })).toContainText("never charges candidates fees");
  });
}

test("New letter doesn't ask where the job is: the company's place decides, or says why it can't", async ({ page }) => {
  const { userId } = await signInAsNewUser(page, "places", "/letters/new");
  const [texas] = await seedCompanies(userId, ["Lone Star Analytics Inc."], { country_code: "US", region_code: "US-TX" });
  const [quebec] = await seedCompanies(userId, ["Exemple Québec Inc."], { country_code: "CA", region_code: "CA-QC" });
  const [montana] = await seedCompanies(userId, ["Big Sky Outfitters LLC"], { country_code: "US", region_code: "US-MT" });
  const [india] = await seedCompanies(userId, ["Sharma Software Pvt Ltd"], { country_code: "IN" });
  const [noState] = await seedCompanies(userId, ["Sample Analytics Inc."], { country_code: "US" });
  const next = page.getByRole("button", { name: "Continue to details" });

  await page.goto(`/letters/new?company=${texas!.id}`);
  await expect(page.getByRole("group", { name: "Where is the job?" })).toHaveCount(0);
  await expect(page.getByLabel("Country", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Texas has no wording of its own, so letters use the federal version.", { exact: false })).toBeVisible();
  await expect(page.getByText("US Letter paper", { exact: false }).first()).toBeVisible();
  await expect(next).toBeEnabled();

  for (const [company, reason] of [
    [quebec, "Quebec offers must be in French."],
    [montana, "Offer letters for Montana aren’t available, because at-will employment works differently there."],
    [india, "Offer letters for India aren’t available yet."],
    [noState, "Add the company’s state in My companies to start a letter."],
  ] as const) {
    await page.getByRole("radio", { name: new RegExp(company!.legal_name.replace(/[.]/g, "\\.")) }).check({ force: true });
    await expect(page.getByRole("status").filter({ hasText: reason })).toBeVisible();
    await expect(next).toBeDisabled();
  }
  await page.getByRole("link", { name: "Edit Sample Analytics Inc." }).click();
  await expect(page.getByRole("dialog").getByLabel("State", { exact: true })).toBeVisible();
});

test("a draft follows its company to another country and keeps the answers that still apply", async ({ page, isMobile }) => {
  const { userId } = await signInAsNewUser(page, "move", "/letters/new");
  const [company] = await seedCompanies(userId, ["Example Engineering GmbH"]);
  await newLetterFor(page, company!.id);
  await page.getByLabel("Full name", { exact: true }).fill("Lena Hoffmann");
  await page.getByLabel("Base salary", { exact: true }).fill("78000");
  await form(page).getByRole("button", { name: "Remove section: Annual bonus" }).click();
  await expect(page.getByRole("status").filter({ hasText: /saved/ })).toHaveText("All changes saved");
  await expect(page.getByRole("button", { name: /Change country/ })).toHaveCount(0);

  const moveCompany = async (country_code: string, region_code: string | null = null) => {
    const { error } = await testAdmin().from("companies").update({ country_code, region_code }).eq("id", company!.id);
    if (error) throw new Error(`move company: ${error.message}`);
    await page.reload();
  };

  await moveCompany("GB");
  await expect(page.getByRole("status").filter({ hasText: "Example Engineering GmbH is now in United Kingdom." })).toBeVisible();
  await page.getByRole("button", { name: "Use United Kingdom wording" }).click();
  await expect(toastText(page, /^Now using United Kingdom wording\./)).toBeVisible();

  await expect(form(page).getByText("United Kingdom", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Use .* wording/ })).toHaveCount(0);
  await expect(page.getByLabel("Full name", { exact: true })).toHaveValue("Lena Hoffmann");
  await expect(page.getByLabel("Base salary", { exact: true })).toHaveValue("78000");
  await expect(form(page).getByRole("article", { name: "Pension", exact: true })).toContainText("Included in every UK letter");
  await expect(form(page).getByRole("region", { name: /Removed sections/ })).toContainText("Annual bonus");
  await expect(page.getByLabel("Bank holidays", { exact: true })).toHaveValue("in_addition");

  await moveCompany("US", "US-NY");
  await page.getByRole("button", { name: "Use United States, New York wording" }).click();
  await expect(toastText(page, /^Now using United States, New York wording\. .*removed: .*Contract/)).toBeVisible();
  await expect(page.getByLabel("Full name", { exact: true })).toHaveValue("Lena Hoffmann");
  await expect(form(page).getByRole("article", { name: "Pay notice", exact: true })).toContainText("Required in New York");
  if (isMobile) await page.getByRole("button", { name: "Preview", exact: true }).click();
  await expect(preview(page)).toContainText("US Letter");
  await expect(preview(page).getByRole("group", { name: /^Letter, page 1 of/ })).toContainText("$78,000");

  // The move is saved: it's still in New York after a reload.
  await page.reload();
  await expect(form(page).getByText("United States, New York", { exact: true })).toBeVisible();
});
