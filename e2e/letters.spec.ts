import { expect, test, type Page } from "@playwright/test";
import { seedCompanies, signInAsNewUser } from "./support/accounts";

// The New letter flow and the editor: filling in, live preview, chips, removing and restoring sections, autosave.

const toastText = (page: Page, text: string) => page.getByRole("region", { name: /Notifications/ }).getByText(text);
const preview = (page: Page) => page.getByRole("region", { name: "Letter preview" });
const form = (page: Page) => page.getByRole("region", { name: "Letter details" });

async function startLetter(page: Page, companyName = "Example Engineering GmbH") {
  const { userId } = await signInAsNewUser(page, "letter", "/letters/new");
  await seedCompanies(userId, [companyName]);
  await page.goto("/letters/new");
  await expect(page.getByRole("heading", { name: "New letter" })).toBeVisible();
  await page.getByRole("button", { name: "Continue to details" }).click();
  await page.waitForURL(/\/letters\/[0-9a-f-]+\/edit$/);
  return { userId, letterId: page.url().split("/").at(-2)! };
}

async function showPreview(page: Page, isMobile: boolean) {
  if (isMobile) await page.getByRole("button", { name: "Preview", exact: true }).click();
}
async function showForm(page: Page, isMobile: boolean) {
  if (isMobile) await page.getByRole("button", { name: /^Form/ }).click();
}

test("a new letter fills in the company and updates the preview as you type", async ({ page, isMobile }) => {
  await startLetter(page);
  await expect(page.getByRole("heading", { name: "Letter details" })).toBeVisible();
  await expect(form(page).getByRole("heading", { name: "Example Engineering GmbH" })).toBeVisible();
  // The company's default signatory is filled in for this letter.
  await expect(page.getByLabel("Signed by", { exact: true })).toHaveValue("Dr. Anna Weber");
  await expect(page.getByText(/required fields? empty/)).toBeVisible();

  await page.getByLabel("Full name", { exact: true }).fill("Lena Hoffmann");
  await page.getByLabel("Job title", { exact: true }).fill("Senior Backend Engineer");
  await expect(page.getByLabel("Letter name", { exact: true })).toHaveValue("Lena Hoffmann – Senior Backend Engineer");

  await showPreview(page, isMobile);
  const firstPage = preview(page).getByRole("group", { name: /^Letter, page 1 of/ });
  await expect(firstPage).toContainText("Offer of employment: Senior Backend Engineer");
  await expect(firstPage).toContainText("Lena Hoffmann");
  // The department is optional: left empty, its words are left out.
  await expect(firstPage).toContainText("the position of Senior Backend Engineer at Example Engineering GmbH.");
  await expect(firstPage).toContainText("Example Engineering GmbH never charges candidates fees.");
});

test("chips for empty fields jump to the field, and the counter goes down", async ({ page, isMobile }) => {
  await startLetter(page);
  await showPreview(page, isMobile);
  const chip = isMobile
    ? preview(page).getByRole("group", { name: "Empty required fields" }).getByRole("button", { name: "Reports to" })
    : preview(page).getByRole("button", { name: "Fill in: Reports to" });
  await chip.click();
  await expect(page.getByLabel("Reports to", { exact: true })).toBeFocused();

  const counter = page.getByText(/\d+ required fields? empty/);
  const before = Number((await counter.textContent())?.match(/\d+/)?.[0]);
  await page.getByLabel("Reports to", { exact: true }).fill("Jonas Becker, Engineering Manager");
  await expect(counter).toHaveText(`${before - 1} required ${before - 1 === 1 ? "field" : "fields"} empty`);

  await showPreview(page, isMobile);
  await expect(preview(page).getByRole("button", { name: "Fill in: Reports to" })).toHaveCount(0);
  await expect(preview(page).getByRole("group", { name: /^Letter, page 1 of/ })).toContainText("You will report to Jonas Becker, Engineering Manager.");
});

test("sections can be removed and restored, but required ones are locked", async ({ page, isMobile }) => {
  await startLetter(page);
  const bonus = form(page).getByRole("article", { name: "Annual bonus" });
  await expect(form(page).getByRole("article", { name: "Notice periods" })).toContainText("Required in Germany");
  await expect(form(page).getByRole("button", { name: "Remove section: Notice periods" })).toHaveCount(0);
  await expect(form(page).getByRole("article", { name: "Your role and start date" })).toContainText("Included in every letter");

  await bonus.getByRole("button", { name: "Remove section: Annual bonus" }).click();
  await expect(toastText(page, "Annual bonus removed from the letter.")).toBeVisible();
  await expect(bonus).toHaveCount(0);
  await expect(form(page).getByRole("heading", { name: "Probation", level: 2 })).toBeFocused();
  const tray = form(page).getByRole("region", { name: /Removed sections/ });
  await expect(tray.getByRole("button", { name: "Restore section: Annual bonus" })).toBeVisible();

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(form(page).getByRole("article", { name: "Annual bonus" })).toBeVisible();
  await expect(tray).toContainText("Sections you remove appear here.");

  await form(page).getByRole("button", { name: "Remove section: Relocation support" }).click();
  await showPreview(page, isMobile);
  await expect(preview(page)).not.toContainText("Relocation support");
  await showForm(page, isMobile);
  await tray.getByRole("button", { name: "Restore section: Relocation support" }).click();
  await expect(toastText(page, "Relocation support restored.")).toBeVisible();
  await expect(form(page).getByRole("heading", { name: "Relocation support", level: 2 })).toBeFocused();
});

test("changes save automatically and are there after a reload", async ({ page }) => {
  await startLetter(page);
  await page.getByLabel("Full name", { exact: true }).fill("Lena Hoffmann");
  await page.getByLabel("Base salary", { exact: true }).fill("78000");
  await expect(page.getByText("That is €6,500.00 in each of 12 payments a year.")).toBeVisible();
  await form(page).getByRole("button", { name: "Remove section: Annual bonus" }).click();
  const status = page.getByRole("status").filter({ hasText: /saved|Saving/ });
  await expect(status).toHaveText("All changes saved");

  await page.reload();
  await expect(page.getByLabel("Full name", { exact: true })).toHaveValue("Lena Hoffmann");
  await expect(page.getByLabel("Base salary", { exact: true })).toHaveValue("78000");
  await expect(form(page).getByRole("region", { name: /Removed sections/ })).toContainText("Annual bonus");
});

test("switching the style and colour changes the preview", async ({ page, isMobile }) => {
  test.skip(isMobile, "The style and colour controls are in the desktop top bar.");
  await startLetter(page);
  await page.getByRole("combobox", { name: "Style" }).selectOption("modern");
  await expect(preview(page)).toContainText("Modern · A4");
  await expect(preview(page).getByRole("group", { name: /^Letter, page 1 of/ })).toContainText("01");
  await page.getByLabel("Brand colour", { exact: true }).fill("#f2a541");
  await expect(page.getByText("#8E6227")).toBeVisible();
  await expect(page.getByText("Darkened for text")).toBeVisible();
});

test("Pay & download takes you to the first empty field", async ({ page }) => {
  await startLetter(page);
  await page.getByRole("button", { name: /Pay & download/ }).click();
  await expect(page.getByLabel("Full name", { exact: true })).toBeFocused();
  await expect(page).toHaveURL(/\/edit$/);
});

test("a second letter for the same company starts with its details", async ({ page }) => {
  const { userId } = await signInAsNewUser(page, "second-letter", "/letters/new");
  const [company] = await seedCompanies(userId, ["Sample Analytics Inc."]);
  for (let i = 0; i < 2; i++) {
    await page.goto(`/letters/new?company=${company!.id}`);
    await page.getByRole("button", { name: "Continue to details" }).click();
    await page.waitForURL(/\/edit$/);
    await expect(form(page).getByRole("heading", { name: "Sample Analytics Inc." })).toBeVisible();
    await expect(page.getByLabel("Signed by", { exact: true })).toHaveValue("Dr. Anna Weber");
    await expect(page.getByLabel("Job title", { exact: true })).toHaveValue("");
  }
  await page.goto("/dashboard");
  await expect(page.getByRole("table", { name: "Your letters" }).getByRole("row")).toHaveCount(3);
});

test("a first letter asks for the company and saves it for next time", async ({ page }) => {
  await signInAsNewUser(page, "first-letter", "/letters/new");
  await page.goto("/letters/new");
  await expect(page.getByRole("heading", { name: "Your company" })).toBeVisible();
  await page.getByLabel("Legal name", { exact: true }).fill("Example Studio Pty Ltd");
  await page.getByLabel("Country of registration", { exact: true }).selectOption({ label: "Germany" });
  await page.getByLabel("Registration number", { exact: true }).fill("HRB 111111");
  await page.getByLabel("Registered address", { exact: true }).fill("Musterweg 1, 10115 Berlin");
  await page.getByLabel("Contact phone", { exact: true }).fill("+49 30 1234 5678");
  await page.getByLabel("Contact email", { exact: true }).fill("people@example-studio.test");
  await page.getByLabel("Name", { exact: true }).fill("Sam Taylor");
  await page.getByLabel("Job title", { exact: true }).fill("Director");
  await page.getByRole("button", { name: "Save company" }).click();

  await expect(page.getByRole("radio", { name: /Example Studio Pty Ltd/ })).toBeChecked();
  await page.getByRole("button", { name: "Continue to details" }).click();
  await page.waitForURL(/\/edit$/);
  await expect(page.getByLabel("Signed by", { exact: true })).toHaveValue("Sam Taylor");
  await page.goto("/companies");
  await expect(page.getByRole("heading", { name: "Example Studio Pty Ltd" })).toBeVisible();
});

test("United States letters use US Letter paper and the state's wording", async ({ page, isMobile }) => {
  const { userId } = await signInAsNewUser(page, "us-letter", "/letters/new");
  await seedCompanies(userId, ["Sample Analytics Inc."]);
  await page.goto("/letters/new");
  await page.getByLabel("Country", { exact: true }).selectOption({ label: "United States" });
  await page.getByLabel("State", { exact: true }).selectOption({ label: "New York" });
  await expect(page.getByText("US Letter paper")).toBeVisible();
  await page.getByRole("button", { name: "Continue to details" }).click();
  await page.waitForURL(/\/edit$/);

  await expect(form(page).getByRole("article", { name: "Pay notice" })).toContainText("Required in New York");
  await expect(form(page).getByRole("article", { name: "At-will employment" })).toContainText("Included in every US letter");
  await showPreview(page, isMobile);
  await expect(preview(page)).toContainText("US Letter");
  await expect(preview(page)).toContainText("New York Labor Law");
});

test("an edit in another tab isn't overwritten", async ({ page, context }) => {
  const { letterId } = await startLetter(page);
  const other = await context.newPage();
  await other.goto(`/letters/${letterId}/edit`);

  await other.getByLabel("Full name", { exact: true }).fill("From the other tab");
  await expect(other.getByRole("status").filter({ hasText: /saved/ })).toHaveText("All changes saved");

  await page.getByLabel("Full name", { exact: true }).fill("From this tab");
  await expect(page.getByRole("alert").filter({ hasText: "changed in another tab" })).toBeVisible();
  await page.getByRole("button", { name: "Reload" }).click();
  await expect(page.getByLabel("Full name", { exact: true })).toHaveValue("From the other tab");
});
