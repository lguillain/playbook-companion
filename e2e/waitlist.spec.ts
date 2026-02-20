/**
 * E2E test for the waitlist flow.
 *
 * Run with:  npx playwright test e2e/waitlist.spec.ts --project=chromium
 *
 * Requires:
 *   - Local Supabase running (`supabase start`)
 *   - Migration 00014_waitlist.sql applied
 *   - Dev server running on localhost:8080
 *
 * What it does:
 *   1. Fills up external active user spots to 10 (via admin API)
 *   2. Signs up user #11 through the real UI
 *   3. Asserts user #11 lands on the waitlist screen
 *   4. Cleans up all test users
 */
import { test, expect } from "@playwright/test";
import {
  admin,
  createTestUser,
  cleanupTestUsers,
  TEST_PASSWORD,
} from "./helpers";

const DOMAIN = "pw-waitlist-test.example.com";
const testEmail = (n: number) => `user${n}@${DOMAIN}`;

const fillerUserIds: string[] = [];

test.describe("Waitlist flow", () => {
  let spotsToFill: number;

  test.beforeAll(async () => {
    // Clean up leftover test users from previous runs
    const { data: existing } = await admin.auth.admin.listUsers();
    if (existing?.users) {
      for (const u of existing.users) {
        if (u.email?.endsWith(`@${DOMAIN}`)) {
          await admin.auth.admin.deleteUser(u.id);
        }
      }
    }

    // Count external active users already in DB
    let externalActive = 0;
    if (existing?.users) {
      for (const u of existing.users) {
        if (u.email && !u.email.endsWith(`@${DOMAIN}`) && !u.email.endsWith("@taskbase.com")) {
          const { data } = await admin.from("profiles").select("status").eq("id", u.id).single();
          if (data?.status === "active") externalActive++;
        }
      }
    }

    spotsToFill = Math.max(0, 10 - externalActive);

    // Fill spots via admin API (fast, no browser needed)
    for (let i = 1; i <= spotsToFill; i++) {
      const userId = await createTestUser(testEmail(i));
      fillerUserIds.push(userId);
    }
  });

  test.afterAll(async () => {
    // Clean up filler users
    for (const id of fillerUserIds.reverse()) {
      await admin.auth.admin.deleteUser(id).catch(() => {});
    }
    fillerUserIds.length = 0;
    await cleanupTestUsers();
  });

  test("waitlisted user signing in sees the waitlist screen", async ({ page }) => {
    const email = testEmail(98);

    // Create user via admin — the trigger will assign "waitlisted" since spots are full
    const userId = await createTestUser(email, "Waitlisted Login");
    fillerUserIds.push(userId);

    // Sign in through the login form
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();

    // Should see the waitlist screen, NOT the dashboard
    await expect(page.getByText("You're on the waiting list")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/when a spot opens up/)).toBeVisible();

    // Leave waitlist and sign out buttons should be present
    await expect(page.getByRole("button", { name: "Leave waitlist" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  });

  test("11th external user sees the waitlist screen", async ({ page }) => {
    const waitlistedEmail = testEmail(99);

    await page.goto("/signup");

    await page.getByLabel("Full name").fill("Waitlisted User");
    await page.getByLabel("Email").fill(waitlistedEmail);
    await page.getByLabel("Password").fill(TEST_PASSWORD);

    await page.getByRole("checkbox").check();
    await page.getByRole("button", { name: "Create account" }).click();

    // Should land on the waitlist screen
    await expect(page.getByText("You're on the waiting list")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/when a spot opens up/)).toBeVisible();

    // Sign out button should be present
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();

    // Track waitlisted user for cleanup
    const { data: users } = await admin.auth.admin.listUsers();
    const waitlistedUser = users?.users.find((u) => u.email === waitlistedEmail);
    if (waitlistedUser) fillerUserIds.push(waitlistedUser.id);
  });

  test("leave waitlist deletes account and redirects to login", async ({ page }) => {
    const email = testEmail(97);

    // Create a waitlisted user
    const userId = await createTestUser(email, "Delete Me");
    // Don't push to fillerUserIds — the test itself deletes the account

    // Sign in
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText("You're on the waiting list")).toBeVisible({ timeout: 10_000 });

    // Click "Leave waitlist"
    await page.getByRole("button", { name: "Leave waitlist" }).click();

    // Confirmation step appears
    await expect(page.getByText("This will delete your account")).toBeVisible();
    await expect(page.getByRole("button", { name: "Yes, delete my account" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();

    // Confirm deletion
    await page.getByRole("button", { name: "Yes, delete my account" }).click();

    // Should be redirected to login after account deletion
    await page.waitForURL(/\/login/, { timeout: 15_000 });

    // Verify the user no longer exists in the DB
    const { data: check } = await admin.auth.admin.getUserById(userId);
    expect(check.user).toBeNull();
  });

  test("leave waitlist cancel stays on waitlist screen", async ({ page }) => {
    const email = testEmail(96);

    const userId = await createTestUser(email, "Cancel Leave");
    fillerUserIds.push(userId);

    // Sign in
    await page.goto("/login");
    await page.getByLabel("Email").fill(email);
    await page.getByLabel("Password").fill(TEST_PASSWORD);
    await page.getByRole("button", { name: "Sign in" }).click();

    await expect(page.getByText("You're on the waiting list")).toBeVisible({ timeout: 10_000 });

    // Click "Leave waitlist"
    await page.getByRole("button", { name: "Leave waitlist" }).click();
    await expect(page.getByText("This will delete your account")).toBeVisible();

    // Click Cancel
    await page.getByRole("button", { name: "Cancel" }).click();

    // Should still be on the waitlist screen with the original buttons
    await expect(page.getByRole("button", { name: "Leave waitlist" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Sign out" })).toBeVisible();
  });
});
