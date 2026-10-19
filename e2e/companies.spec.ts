import { expect, test, type Page } from "@playwright/test";
import sharp from "sharp";
import { seedCompanies, seedPaidLetter, signInAsNewUser } from "./support/accounts";

const drawer = (page: Page) => page.getByRole("dialog");
// Radix also renders a hidden copy of each toast for screen readers, so look inside the notifications region.
const toastText = (page: Page, text: string) => page.getByRole("region", { name: /Notifications/ }).getByText(text);
const card = (page: Page, name: string) => page.getByRole("listitem").filter({ has: page.getByRole("heading", { name, exact: true }) });

async function openMenu(page: Page, name: string) {
  await page.getByRole("button", { name: `More actions for ${name}` }).click();
  return page.getByRole("menu", { name: `Actions for ${name}` });
}

test("a first company: empty state, validation and save", async ({ page, isMobile }) => {
  await signInAsNewUser(page, "first-company");
  await expect(page.getByRole("heading", { name: "Add your first company" })).toBeVisible();

  await page.getByRole("link", { name: "Add company" }).first().click();
  await expect(drawer(page).getByRole("heading", { name: "Add company" })).toBeVisible();
  await expect(drawer(page)).toContainText("This uses place 1 of 5.");

  const form = drawer(page);
  await form.getByLabel("Legal name").fill("Example Engineering GmbH");
  await form.getByLabel("Country of registration").selectOption({ label: "Germany" });
  await form.getByLabel("Registration number").fill("HRB 000000");
  await form.getByLabel("Registered address").fill("Musterstraße 1, 80331 München");
  await form.getByLabel("Website").fill("example-engineering");
  await form.getByLabel("Contact phone").fill("+49 89 1234 5678");
  await form.getByLabel("Contact email").fill("people@example-engineering");
  await form.getByLabel("Name", { exact: true }).fill("Dr. Anna Weber");
  await form.getByLabel("Job title").fill("Managing Director");
  await form.getByRole("button", { name: "Save company" }).click();

  const summary = form.getByRole("alert").filter({ hasText: "to fix before saving" });
  await expect(summary).toContainText("2 things to fix before saving");
  await expect(summary).toBeFocused();
  await expect(summary.getByRole("link", { name: /Website: Enter a full web address/ })).toBeVisible();
  await expect(form.getByLabel("Contact email")).toHaveAttribute("aria-invalid", "true");
  await expect(form.locator("#company-contact-email-error")).toHaveText("Add the ending, like .com");

  await form.getByLabel("Website").fill("example-engineering.test");
  await form.getByLabel("Contact email").fill("people@example-engineering.test");
  await form.getByRole("button", { name: "Save company" }).click();

  // The toast lasts 5 seconds; under load closing the drawer can take longer, so check the toast first.
  await expect(toastText(page, "Company saved. It will fill in on your next letter.")).toBeVisible();
  await expect(drawer(page)).toBeHidden();
  await expect(page.getByRole("heading", { name: "Example Engineering GmbH" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "1 of 5 company places used" })).toBeVisible();
  if (!isMobile) await expect(page.getByRole("link", { name: /My companies\s*1 of 5/ })).toBeVisible();
});

test("a company saves without a contact phone or email; required fields are marked", async ({ page }) => {
  await signInAsNewUser(page, "no-contacts");
  await page.getByRole("link", { name: "Add company" }).first().click();
  const form = drawer(page);
  // A red asterisk marks the required fields; the optional ones have none, and only required controls say so.
  const mark = (id: string) => form.locator(`label[for="${id}"] + span`);
  await expect(mark("company-legal-name")).toHaveText("*");
  await expect(mark("company-signatory-name")).toHaveText("*");
  await expect(mark("company-contact-phone")).toHaveCount(0);
  await expect(mark("company-contact-email")).toHaveCount(0);
  await expect(form.getByLabel("Legal name")).toHaveAttribute("aria-required", "true");
  await expect(form.getByLabel("Contact email")).not.toHaveAttribute("aria-required", "true");

  await form.getByLabel("Legal name").fill("Quiet Studio Ltd");
  await form.getByLabel("Country of registration").selectOption({ label: "United Kingdom" });
  await form.getByLabel("Registration number").fill("12345678");
  await form.getByLabel("Registered address").fill("1 High Street, London");
  await form.getByLabel("Name", { exact: true }).fill("Sam Taylor");
  await form.getByLabel("Job title").fill("Director");
  await form.getByRole("button", { name: "Save company" }).click();
  await expect(toastText(page, "Company saved. It will fill in on your next letter.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Quiet Studio Ltd" })).toBeVisible();
});

test("US and Canadian companies give their state or province, which their letters use", async ({ page }) => {
  await signInAsNewUser(page, "company-state");
  await page.getByRole("link", { name: "Add company" }).first().click();
  const form = drawer(page);
  await form.getByLabel("Legal name").fill("Sample Analytics Inc.");
  await form.getByLabel("Country of registration").selectOption({ label: "Germany" });
  await expect(form.getByLabel("State", { exact: true })).toHaveCount(0);
  await form.getByLabel("Country of registration").selectOption({ label: "Canada" });
  await expect(form.getByLabel("Province or territory", { exact: true })).toBeVisible();
  await form.getByLabel("Province or territory", { exact: true }).selectOption({ label: "Ontario" });
  // Changing the country clears a province that isn't in it.
  await form.getByLabel("Country of registration").selectOption({ label: "United States" });
  await expect(form.getByLabel("State", { exact: true })).toHaveValue("");
  await expect(form.locator(`label[for="company-region-code"] + span`)).toHaveText("*");
  await form.getByLabel("Registration number").fill("EIN 12-3456789");
  await form.getByLabel("Registered address").fill("1 Market Street, San Francisco, CA 94105");
  await form.getByLabel("Name", { exact: true }).fill("Jamie Lee");
  await form.getByLabel("Job title").fill("Head of People");
  await form.getByRole("button", { name: "Save company" }).click();
  await expect(form.getByRole("alert").filter({ hasText: "to fix before saving" })).toContainText("State: Choose the state where the company is based");

  await form.getByLabel("State", { exact: true }).selectOption({ label: "California" });
  await form.getByRole("button", { name: "Save company" }).click();
  await expect(drawer(page)).toBeHidden();
  await expect(card(page, "Sample Analytics Inc.").getByText("United States, California", { exact: false }).filter({ visible: true })).toBeVisible();

  await page.goto("/letters/new");
  await expect(page.getByText("Letters use United States, California wording", { exact: false })).toBeVisible();
});

test("editing keeps the details, darkens a light brand colour and stores a logo", async ({ page, isMobile }) => {
  const { userId } = await signInAsNewUser(page, "edit-company");
  const [company] = await seedCompanies(userId, ["Sample Analytics Inc."]);
  await page.goto(`/companies?edit=${company!.id}`);

  const form = drawer(page);
  await expect(form.getByRole("heading", { name: "Edit company" })).toBeVisible();
  await expect(form.getByLabel("Legal name")).toHaveValue("Sample Analytics Inc.");

  await form.getByLabel("Brand colour", { exact: true }).fill("#F2A541");
  await expect(form.getByText(/letters use the darker shade #8E6227/)).toBeVisible();

  await form.locator("#company-logo").setInputFiles({
    name: "logo.svg",
    mimeType: "image/svg+xml",
    buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
  });
  await expect(form.getByText("Upload a PNG, JPG or WebP file. SVG isn’t accepted.")).toBeVisible();

  const png = await sharp({ create: { width: 640, height: 180, channels: 4, background: "#1F4E8C" } }).png().toBuffer();
  await form.locator("#company-logo").setInputFiles({ name: "logo-sample.png", mimeType: "image/png", buffer: png });
  await expect(form.getByRole("img", { name: "New logo preview" })).toBeVisible();
  await expect(form.getByText(/logo-sample\.png · \d+ KB/)).toBeVisible();

  await form.getByLabel("Name", { exact: true }).fill("Morgan Lee");
  await form.getByRole("button", { name: "Save changes" }).click();
  // The toast lasts 5 seconds; under load closing the drawer can take longer, so check the toast first.
  // The heaviest save in the app (re-encoding and storing the logo): allow for a busy machine.
  await expect(toastText(page, "Changes to Sample Analytics Inc. saved.")).toBeVisible({ timeout: 30_000 });
  await expect(drawer(page)).toBeHidden();

  const saved = card(page, "Sample Analytics Inc.");
  await expect(saved.locator("img")).toHaveAttribute("src", /\/storage\/v1\/object\/sign\/logos\//);
  if (!isMobile) {
    await expect(saved).toContainText("Morgan Lee");
    await expect(saved).toContainText("#F2A541");
    await expect(saved).toContainText("darkened for text");
  }

  await page.goto(`/companies?edit=${company!.id}`);
  await expect(drawer(page).getByRole("img", { name: "Current logo" })).toBeVisible();
  await expect(drawer(page).getByText("640 × 180 px")).toBeVisible();
  await expect(drawer(page).getByLabel("Brand colour", { exact: true })).toHaveValue("#F2A541");
});

test("archive with undo, restore, and delete a company without paid letters", async ({ page }) => {
  const { userId } = await signInAsNewUser(page, "archive-company");
  await seedCompanies(userId, ["Example Studio Pty Ltd", "Sample Foods Ltd"]);
  await page.goto("/companies");

  await (await openMenu(page, "Sample Foods Ltd")).getByRole("menuitem", { name: "Archive company" }).click();
  await expect(toastText(page, "Sample Foods Ltd archived. It can’t be used for new letters.")).toBeVisible();
  await expect(card(page, "Sample Foods Ltd").getByText("Archived", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "2 of 5 company places used" })).toBeVisible();

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(card(page, "Sample Foods Ltd").getByText("Archived", { exact: true })).toBeHidden();

  await (await openMenu(page, "Sample Foods Ltd")).getByRole("menuitem", { name: "Archive company" }).click();
  await expect(card(page, "Sample Foods Ltd").getByText("Archived", { exact: true })).toBeVisible();
  await (await openMenu(page, "Sample Foods Ltd")).getByRole("menuitem", { name: "Restore company" }).click();
  await expect(toastText(page, "Sample Foods Ltd is back in use.")).toBeVisible();
  await expect(card(page, "Sample Foods Ltd").getByText("Archived", { exact: true })).toBeHidden();

  await (await openMenu(page, "Example Studio Pty Ltd")).getByRole("menuitem", { name: /Delete company/ }).click();
  const confirm = page.getByRole("alertdialog", { name: "Delete Example Studio Pty Ltd?" });
  await expect(confirm).toContainText("This frees one of your 5 company places and can’t be undone.");
  await confirm.getByRole("button", { name: "Delete company" }).click();
  await expect(toastText(page, "Example Studio Pty Ltd deleted. One company place is free again.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Example Studio Pty Ltd" })).toBeHidden();
  await expect(page.getByRole("heading", { name: "1 of 5 company places used" })).toBeVisible();
});

test("a company with paid letters can only be archived", async ({ page }) => {
  const { userId } = await signInAsNewUser(page, "paid-company");
  const [company] = await seedCompanies(userId, ["Example Engineering GmbH"]);
  await seedPaidLetter(userId, company!.id);
  await page.goto("/companies");

  const menu = await openMenu(page, "Example Engineering GmbH");
  const remove = menu.getByRole("menuitem", { name: /Delete company/ });
  await expect(remove).toHaveAttribute("aria-disabled", "true");
  await expect(remove).toContainText("Not available: it has paid letters. Archive it instead.");
});

test("at the limit, adding is blocked and deleting frees a place", async ({ page }) => {
  const { userId } = await signInAsNewUser(page, "limit");
  const names = ["Example Engineering GmbH", "Sample Analytics Inc.", "Example Studio Pty Ltd", "Sample Logistics BV", "Sample Foods Ltd"];
  const companies = await seedCompanies(userId, names);
  await seedPaidLetter(userId, companies[0]!.id);
  await page.goto("/companies?add=1");

  // At the limit the add drawer stays shut and the stale ?add=1 is dropped, so it can't pop open later.
  await expect(page).toHaveURL(/\/companies$/);
  await expect(page.getByRole("heading", { name: "You’ve reached your limit of 5 companies" })).toBeVisible();
  await expect(drawer(page)).toBeHidden();
  await expect(page.getByRole("button", { name: "Add company" })).toHaveAttribute("aria-disabled", "true");

  const table = page.getByRole("table", { name: "Your companies" });
  await expect(table.getByRole("row")).toHaveCount(6);
  await expect(table.getByRole("row", { name: /Example Engineering GmbH/ })).toContainText("No, it has paid letters");

  await table.getByRole("button", { name: "Delete Sample Foods Ltd" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Delete company" }).click();
  await expect(page.getByRole("heading", { name: "4 of 5 company places used" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Add company" })).toBeVisible();
});

test("the database turns away a 6th company even from an open form", async ({ page }) => {
  const { userId } = await signInAsNewUser(page, "limit-race");
  await seedCompanies(userId, ["Company One Ltd", "Company Two Ltd", "Company Three Ltd", "Company Four Ltd"]);
  await page.goto("/companies?add=1");
  const form = drawer(page);
  await expect(form).toContainText("This uses place 5 of 5.");

  // Another tab fills the last place while this form is open.
  await seedCompanies(userId, ["Company Five Ltd"]);

  await form.getByLabel("Legal name").fill("Company Six Ltd");
  await form.getByLabel("Country of registration").selectOption({ label: "United Kingdom" });
  await form.getByLabel("Registration number").fill("00000000");
  await form.getByLabel("Registered address").fill("1 Example Street, London");
  await form.getByLabel("Contact phone").fill("+44 20 7946 0000");
  await form.getByLabel("Contact email").fill("people@example.test");
  await form.getByLabel("Name", { exact: true }).fill("Sam Taylor");
  await form.getByLabel("Job title").fill("Director");
  await form.getByRole("button", { name: "Save company" }).click();

  await expect(form.getByRole("alert")).toContainText("You’ve reached your limit of 5 companies.");
});
