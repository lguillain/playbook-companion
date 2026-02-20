/**
 * E2E tests for authentication flows.
 *
 * Covers: login, signup, forgot password, navigation guards, sign out.
 *
 * Run with:  npx playwright test e2e/auth.spec.ts --project=chromium
 */
import { test, expect } from "@playwright/test";
import {
  createTestUser,
  cleanupTestUsers,
  cleanupStaleDomainUsers,
  loginViaUI,
  testEmail,
  TEST_PASSWORD,
  seedPlaybookSections,
  cleanupPlaybookData,
} from "./helpers";

test.describe("Authentication flows", () => {
  test.beforeAll(async () => {
    await cleanupStaleDomainUsers();
  });

  test.afterAll(async () => {
    await cleanupTestUsers();
  });

  // ── Login ──────────────────────────────────────────────────────────

  test("login with valid credentials lands on dashboard", async ({ page }) => {
    const email = testEmail("login-ok");
    const userId = await createTestUser(email, "Login User");
    await seedPlaybookSections(userId);

    await loginViaUI(page, email);

    // Should see the app header with Dashboard tab active
    await expect(page.getByRole("button", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByText("Playbook Health")).toBeVisible({ timeout: 10_000 });

    await cleanupPlaybookData(userId);
  });

  test("login with wrong password shows error", async ({ page }) => {
    const email = testEmail("login-bad");
    await createTestUser(email);

    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill("wrongpassword");
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText(/invalid/i)).toBeVisible({ timeout: 5_000 });
    // Should still be on /login
    expect(page.url()).toContain("/login");
  });

  test("login page has link to signup", async ({ page }) => {
    await page.goto("/login");
    const link = page.getByRole("link", { name: /sign up/i });
    await expect(link).toBeVisible();
    await link.click();
    await page.waitForURL("/signup");
  });

  test("login page has link to forgot password", async ({ page }) => {
    await page.goto("/login");
    const link = page.getByRole("link", { name: /forgot password/i });
    await expect(link).toBeVisible();
    await link.click();
    await page.waitForURL("/forgot-password");
  });

  // ── Signup ─────────────────────────────────────────────────────────

  test("signup without disclaimer checkbox shows error", async ({ page }) => {
    await page.goto("/signup");
    await page.getByLabel("Full name").fill("No Disclaimer");
    await page.getByLabel("Email").fill(testEmail("no-disc"));
    await page.getByLabel("Password").fill(TEST_PASSWORD);
    // Do NOT check the checkbox
    await page.getByRole("button", { name: "Create account" }).click();

    await expect(page.getByText(/must accept/i)).toBeVisible();
    // Should still be on /signup
    expect(page.url()).toContain("/signup");
  });

  test("signup happy path creates account and navigates to app", async ({ page }) => {
    const email = testEmail("signup-ok");

    await page.goto("/signup");
    await page.getByLabel("Full name").fill("Test Signup User");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(TEST_PASSWORD);
    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Create account" }).click();

    // Should navigate away from /signup (to / or waitlist)
    await expect(page).not.toHaveURL(/\/signup/, { timeout: 10_000 });
  });

  test("signup page has link to login", async ({ page }) => {
    await page.goto("/signup");
    const link = page.getByRole("link", { name: /sign in/i });
    await expect(link).toBeVisible();
    await link.click();
    await page.waitForURL("/login");
  });

  // ── Forgot password ────────────────────────────────────────────────

  test("forgot password shows confirmation message", async ({ page }) => {
    const email = testEmail("forgot");
    await createTestUser(email);

    await page.goto("/forgot-password");
    await expect(page.getByText("Reset password")).toBeVisible();

    await page.getByLabel("Email").fill(email);
    await page.getByRole("button", { name: "Send reset link" }).click();

    await expect(page.getByText(/check your email/i)).toBeVisible({ timeout: 5_000 });
  });

  test("forgot password has back to sign in link", async ({ page }) => {
    await page.goto("/forgot-password");
    const link = page.getByRole("link", { name: /sign in/i });
    await expect(link).toBeVisible();
    await link.click();
    await page.waitForURL("/login");
  });

  // ── Reset password page ────────────────────────────────────────────

  test("reset password page shows form", async ({ page }) => {
    await page.goto("/reset-password");
    await expect(page.getByText("Set new password")).toBeVisible();
    await expect(page.getByLabel("New password")).toBeVisible();
    await expect(page.getByLabel("Confirm password")).toBeVisible();
    await expect(page.getByRole("button", { name: "Update password" })).toBeVisible();
  });

  test("reset password shows mismatch error", async ({ page }) => {
    await page.goto("/reset-password");
    await page.getByLabel("New password").fill("password1");
    await page.getByLabel("Confirm password").fill("password2");
    await page.getByRole("button", { name: "Update password" }).click();

    await expect(page.getByText(/do not match/i)).toBeVisible();
  });

  // ── Navigation guards ──────────────────────────────────────────────

  test("unauthenticated user visiting / is redirected to /login", async ({ page }) => {
    await page.goto("/");
    await page.waitForURL(/\/login/, { timeout: 10_000 });
  });

  test("authenticated user visiting /login is redirected to /", async ({ page }) => {
    const email = testEmail("guard-auth");
    const userId = await createTestUser(email, "Guard User");
    await seedPlaybookSections(userId);

    await loginViaUI(page, email);
    // Now visit /login — should redirect back to /
    await page.goto("/login");
    await page.waitForURL("/", { timeout: 10_000 });

    await cleanupPlaybookData(userId);
  });

  // ── Sign out ───────────────────────────────────────────────────────

  test("sign out returns to login page", async ({ page }) => {
    const email = testEmail("signout");
    const userId = await createTestUser(email, "Signout User");
    await seedPlaybookSections(userId);

    await loginViaUI(page, email);

    // User may land on dashboard or waitlist screen depending on active user count.
    // Both have a sign-out mechanism — use whichever is visible.
    const headerSignOut = page.getByTitle("Sign out");
    const waitlistSignOut = page.getByRole("button", { name: "Sign out" });

    const signOutBtn = await headerSignOut.isVisible().then((v) =>
      v ? headerSignOut : waitlistSignOut,
    );
    await signOutBtn.click();
    await page.waitForURL(/\/login/, { timeout: 15_000 });

    await cleanupPlaybookData(userId);
  });
});
