/**
 * E2E tests for the Integrations tab.
 *
 * Covers: panel layout, source cards, upload button, start-over section.
 *
 * Run with:  npx playwright test e2e/integrations.spec.ts --project=chromium
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

test.describe("Integrations Panel", () => {
  test.beforeAll(async () => {
    await cleanupStaleDomainUsers();
    email = testEmail("integrations");
    userId = await createTestUser(email, "Connect User");
    await seedPlaybookSections(userId);
  });

  test.afterAll(async () => {
    await cleanupPlaybookData(userId);
    await cleanupTestUsers();
  });

  test.beforeEach(async ({ page }) => {
    await loginViaUI(page, email);
    await page.getByRole("button", { name: "Integrations" }).click();
  });

  // ── Panel layout ───────────────────────────────────────────────────

  test("integrations heading and description are visible", async ({ page }) => {
    await expect(page.getByRole("heading", { name: "Integrations" })).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Connect a source or upload a file")).toBeVisible();
  });

  test("shows section count when playbook is loaded", async ({ page }) => {
    await expect(page.getByText(/\d+ sections currently loaded/)).toBeVisible({
      timeout: 10_000,
    });
  });

  // ── Source cards ───────────────────────────────────────────────────

  test("Confluence source card with Connect button", async ({ page }) => {
    await expect(page.getByText("Confluence").first()).toBeVisible({ timeout: 5_000 });
    // Should have a Connect button (not connected)
    await expect(page.getByRole("button", { name: /connect/i }).first()).toBeVisible();
  });

  test("Notion source card with Connect button", async ({ page }) => {
    await expect(page.getByText("Notion").first()).toBeVisible({ timeout: 5_000 });
  });

  test("PDF upload card with Upload button", async ({ page }) => {
    await expect(page.getByText("PDF / Text Upload")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Upload a .pdf, .txt, or .md file")).toBeVisible();
    await expect(page.getByRole("button", { name: /upload/i })).toBeVisible();
  });

  // ── Start over / wipe ──────────────────────────────────────────────

  test("start over section is visible when playbook exists", async ({ page }) => {
    await expect(page.getByText("Start over")).toBeVisible({ timeout: 10_000 });
    await expect(
      page.getByText("Wipe all playbook sections"),
    ).toBeVisible();
  });

  test("clicking Restart shows confirmation", async ({ page }) => {
    await expect(page.getByText("Start over")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /restart/i }).click();

    // Confirmation buttons should appear
    await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
    await expect(page.getByRole("button", { name: /confirm wipe/i })).toBeVisible();
  });

  test("clicking Cancel in reset confirmation goes back", async ({ page }) => {
    await expect(page.getByText("Start over")).toBeVisible({ timeout: 10_000 });
    await page.getByRole("button", { name: /restart/i }).click();
    await page.getByRole("button", { name: "Cancel" }).click();

    // Should be back to showing just the Restart button
    await expect(page.getByRole("button", { name: /restart/i })).toBeVisible();
    await expect(page.getByRole("button", { name: /confirm wipe/i })).not.toBeVisible();
  });
});
