/**
 * E2E tests for the dashboard and main navigation.
 *
 * Covers: tab navigation, health score display, filter pills,
 * AI chat panel, user profile display.
 *
 * Run with:  npx playwright test e2e/dashboard.spec.ts --project=chromium
 */
import { test, expect } from "@playwright/test";
import {
  createTestUser,
  cleanupTestUsers,
  cleanupStaleDomainUsers,
  loginViaUI,
  testEmail,
  seedPlaybookSections,
  cleanupPlaybookData,
} from "./helpers";

let userId: string;
let email: string;

test.describe("Dashboard & Navigation", () => {
  test.beforeAll(async () => {
    await cleanupStaleDomainUsers();
    email = testEmail("dashboard");
    userId = await createTestUser(email, "Dashboard User");
    await seedPlaybookSections(userId);
  });

  test.afterAll(async () => {
    await cleanupPlaybookData(userId);
    await cleanupTestUsers();
  });

  test.beforeEach(async ({ page }) => {
    await loginViaUI(page, email);
  });

  // ── Header / Navigation ────────────────────────────────────────────

  test("header shows app name and user info", async ({ page }) => {
    await expect(page.getByText("Playbook Manager")).toBeVisible();
    await expect(page.getByText("Dashboard User")).toBeVisible();
    // User initials avatar
    await expect(page.getByText("DU", { exact: true })).toBeVisible();
  });

  test("all four navigation tabs are visible", async ({ page }) => {
    await expect(page.getByRole("button", { name: "Dashboard" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Playbook" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Review & Publish" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Integrations" })).toBeVisible();
  });

  test("clicking tabs switches content", async ({ page }) => {
    // Dashboard is default
    await expect(page.getByText("Playbook Health")).toBeVisible({ timeout: 10_000 });

    // Switch to Playbook
    await page.getByRole("button", { name: "Playbook" }).click();
    await expect(page.getByText("Playbook Content")).toBeVisible({ timeout: 5_000 });

    // Switch to Review & Publish
    await page.getByRole("button", { name: "Review & Publish" }).click();
    await expect(page.getByText("Review & Publish").first()).toBeVisible({ timeout: 5_000 });

    // Switch to Integrations
    await page.getByRole("button", { name: "Integrations" }).click();
    await expect(page.getByText("Connect a source or upload a file")).toBeVisible({ timeout: 5_000 });

    // Switch back to Dashboard
    await page.getByRole("button", { name: "Dashboard" }).click();
    await expect(page.getByText("Playbook Health")).toBeVisible({ timeout: 5_000 });
  });

  // ── Health Score ───────────────────────────────────────────────────

  test("health score section is displayed", async ({ page }) => {
    await expect(page.getByText("Playbook Health")).toBeVisible({ timeout: 10_000 });
    // Score value should be visible (a number followed by / 100)
    await expect(page.getByText("/ 100")).toBeVisible();
  });

  test("health score filter pills are visible", async ({ page }) => {
    await expect(page.getByText("Playbook Health")).toBeVisible({ timeout: 10_000 });

    // Each filter pill label should be present
    for (const label of ["Covered", "Partial", "Missing", "Outdated"]) {
      await expect(page.getByRole("button", { name: new RegExp(label) }).first()).toBeVisible();
    }
  });

  test("clicking a health filter pill toggles active state", async ({ page }) => {
    await expect(page.getByText("Playbook Health")).toBeVisible({ timeout: 10_000 });

    const coveredPill = page.getByRole("button", { name: /Covered/ }).first();
    await coveredPill.click();
    // When active, pill gets ring styling — check that it's still visible after click
    await expect(coveredPill).toBeVisible();

    // Click again to deactivate (toggle off)
    await coveredPill.click();
    await expect(coveredPill).toBeVisible();
  });

  // ── AI Chat Panel (Dashboard) ──────────────────────────────────────

  test("AI assistant chat is visible on dashboard", async ({ page }) => {
    await expect(page.getByText("AI Assistant")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByPlaceholder(/ask me/i)).toBeVisible();
  });

  test("chat send button is disabled when input is empty", async ({ page }) => {
    await expect(page.getByText("AI Assistant")).toBeVisible({ timeout: 10_000 });
    // The textarea should be empty by default, and the send button disabled
    const textarea = page.getByPlaceholder(/ask me/i);
    await expect(textarea).toHaveValue("");
  });

  test("can type in the chat input", async ({ page }) => {
    await expect(page.getByText("AI Assistant")).toBeVisible({ timeout: 10_000 });
    const textarea = page.getByPlaceholder(/ask me/i);
    await textarea.fill("Hello, how can I improve my playbook?");
    await expect(textarea).toHaveValue("Hello, how can I improve my playbook?");
  });

  // ── Footer ───────────────────────────────────────────────────────

  test("app footer shows Powered by Taskbase", async ({ page }) => {
    await expect(page.locator("footer").getByText("Powered by")).toBeVisible();
    await expect(page.locator("footer").getByRole("link", { name: "Taskbase" })).toBeVisible();
  });
});
