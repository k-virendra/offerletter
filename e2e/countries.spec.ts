import { expect, test, type Page } from "@playwright/test";
import { seedCompanies, signInAsNewUser } from "./support/accounts";

// Country packs: every launch country opens with its own wording, Quebec waits for French, and a draft can move
// to another country keeping the answers that still apply.

const toastText = (page: Page, text: string | RegExp) => page.getByRole("region", { name: /Notifications/ }).getByText(text);
const form = (page: Page) => page.getByRole("region", { name: "Letter details" });
const preview = (page: Page) => page.getByRole("region", { name: "Letter preview" });

async function newLetterIn(page: Page, country: string, region?: string) {
  await page.goto("/letters/new");
  await page.getByLabel("Country", { exact: true }).selectOption({ label: country });
  if (region) await page.getByLabel(/^(State|Province)$/).selectOption({ label: region });
  await page.getByRole("button", { name: "Continue to details" }).click();
  await page.waitForURL(/\/edit$/);
}

const SWEEP: { country: string; region?: string; chip: string; locked: [string, string][] }[] = [
  { country: "Germany", chip: "Germany", locked: [["Notice periods", "Required in Germany"], ["Written terms of employment", "Required in Germany"]] },
  { country: "Ireland", chip: "Ireland", locked: [["Written terms of employment", "Required in Ireland"]] },
  { country: "Netherlands", chip: "Netherlands", locked: [["Your role and start date", "Included in every letter"]] },
  { country: "United Kingdom", chip: "United Kingdom", locked: [["Pension", "Included in every UK letter"], ["Written terms of employment", "Required in the United Kingdom"]] },
  { country: "Australia", chip: "Australia", locked: [["Superannuation", "Included in every Australian letter"], ["Information statements", "Required in Australia"]] },
  { country: "New Zealand", chip: "New Zealand", locked: [["KiwiSaver", "Included in every New Zealand letter"], ["Your right to seek advice", "Required in New Zealand"]] },
  { country: "Canada", region: "Ontario", chip: "Canada, Ontario", locked: [["Compensation", "Included in every letter"]] },
  { country: "Canada", region: "British Columbia", chip: "Canada, British Columbia", locked: [["Compensation", "Included in every letter"]] },
  { country: "Canada", region: "Alberta", chip: "Canada, Alberta", locked: [["Compensation", "Included in every letter"]] },
  { country: "United States", region: "California", chip: "United States, California", locked: [["At-will employment", "Included in every US letter"], ["Wage notice", "Required in California"]] },
  { country: "United States", region: "New York", chip: "United States, New York", locked: [["Pay notice", "Required in New York"]] },
  { country: "United States", region: "Another state (national wording)", chip: "United States", locked: [["At-will employment", "Included in every US letter"]] },
];

for (const { country, region, chip, locked } of SWEEP) {
  test(`${chip} letters open with their own wording`, async ({ page, isMobile }) => {
    test.skip(isMobile, "One pass per country is enough; the phone layout is covered elsewhere.");
    const { userId } = await signInAsNewUser(page, `sweep-${chip.replace(/\W+/g, "-").toLowerCase()}`, "/letters/new");
    await seedCompanies(userId, ["Example Engineering GmbH"]);
    await newLetterIn(page, country, region);
    await expect(form(page).getByText(chip, { exact: true })).toBeVisible();
    for (const [section, reason] of locked) {
      await expect(form(page).getByRole("article", { name: section, exact: true }), `${chip}: ${section}`).toContainText(reason);
    }
    await expect(preview(page).getByRole("group", { name: /^Letter, page 1 of/ })).toContainText("never charges candidates fees");
  });
}

test("Quebec waits for a French version, and Montana is explained", async ({ page }) => {
  const { userId } = await signInAsNewUser(page, "quebec", "/letters/new");
  await seedCompanies(userId, ["Example Engineering GmbH"]);
  await page.goto("/letters/new");
  await page.getByLabel("Country", { exact: true }).selectOption({ label: "Canada" });
  await expect(page.getByRole("option", { name: "Quebec (not available yet)" })).toBeDisabled();
  await expect(page.getByText("Quebec: Quebec offers must be in French.", { exact: false })).toBeVisible();
  await page.getByLabel("Country", { exact: true }).selectOption({ label: "United States" });
  await expect(page.getByText("Montana isn’t available, because at-will employment works differently there.", { exact: false })).toBeVisible();
});

test("a draft moves to another country and keeps the answers that still apply", async ({ page, isMobile }) => {
  const { userId } = await signInAsNewUser(page, "move", "/letters/new");
  await seedCompanies(userId, ["Example Engineering GmbH"]);
  await newLetterIn(page, "Germany");
  await page.getByLabel("Full name", { exact: true }).fill("Lena Hoffmann");
  await page.getByLabel("Base salary", { exact: true }).fill("78000");
  await form(page).getByRole("button", { name: "Remove section: Annual bonus" }).click();

  await page.getByRole("button", { name: "Change country" }).click();
  const dialog = page.getByRole("dialog", { name: "Change country" });
  await dialog.getByLabel("Country", { exact: true }).selectOption({ label: "United Kingdom" });
  await dialog.getByRole("button", { name: "Change country" }).click();
  await expect(toastText(page, /^Now using United Kingdom wording\./)).toBeVisible();

  await expect(form(page).getByText("United Kingdom", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Full name", { exact: true })).toHaveValue("Lena Hoffmann");
  await expect(page.getByLabel("Base salary", { exact: true })).toHaveValue("78000");
  await expect(form(page).getByRole("article", { name: "Pension", exact: true })).toContainText("Included in every UK letter");
  await expect(form(page).getByRole("region", { name: /Removed sections/ })).toContainText("Annual bonus");
  await expect(page.getByLabel("Bank holidays", { exact: true })).toHaveValue("in_addition");

  await page.getByRole("button", { name: "Change country" }).click();
  await dialog.getByLabel("Country", { exact: true }).selectOption({ label: "United States" });
  await dialog.getByLabel("State", { exact: true }).selectOption({ label: "New York" });
  await dialog.getByRole("button", { name: "Change country" }).click();
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
