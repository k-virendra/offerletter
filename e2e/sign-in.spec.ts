import { expect, test } from "@playwright/test";
import { latestEmailTo, signInCode, signInLink, uniqueEmail } from "./support/mailpit";

test("signed-out visitors are sent to sign-in and come back afterwards", async ({ page }) => {
  await page.goto("/dashboard");
  await expect(page).toHaveURL(/\/sign-in\?next=%2Fdashboard$/);
  await expect(page.getByLabel("Work email")).toBeVisible();
});

test("an incomplete email address gets a clear message", async ({ page }) => {
  await page.goto("/sign-in");
  await page.getByLabel("Work email").fill("name@");
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByText("Enter a full email address, like name@company.com")).toBeVisible();
  await expect(page.getByLabel("Work email")).toHaveAttribute("aria-invalid", "true");
});

test("the emailed link signs a new user in and opens the dashboard", async ({ page }) => {
  const email = uniqueEmail("link");
  await page.goto("/sign-in?next=/dashboard");
  await page.getByLabel("Work email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();
  await expect(page.getByRole("heading", { name: "Check your email" })).toBeVisible();

  await page.goto(signInLink(await latestEmailTo(email)));
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Letters", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "No letters yet" })).toBeVisible();
});

test("the 6-digit code from the email also signs in", async ({ page }) => {
  const email = uniqueEmail("code");
  await page.goto("/sign-in?next=/dashboard");
  await page.getByLabel("Work email").fill(email);
  await page.getByRole("button", { name: "Email me a sign-in link" }).click();

  await page.getByLabel("Or enter the 6-digit code").fill(signInCode(await latestEmailTo(email)));
  await page.getByRole("button", { name: "Sign in with code" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Letters", level: 1 })).toBeVisible();
});

test("a used or expired link explains what happened", async ({ page }) => {
  await page.goto("/auth/confirm?token_hash=not-a-real-token&type=email&next=/dashboard");
  await expect(page).toHaveURL(/\/sign-in\?error=link_expired/);
  await expect(page.getByRole("alert").filter({ hasText: "This sign-in link has expired or was already used" })).toBeVisible();
});
