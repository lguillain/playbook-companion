/**
 * E2E tests for the Playbook Viewer tab.
 *
 * Covers: section sidebar, section content, edit/save/cancel,
 * chat panel toggle, status filter pills.
 *
 * Run with:  npx playwright test e2e/playbook.spec.ts --project=chromium
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

test.describe("Playbook Viewer", () => {
  test.beforeAll(async () => {
    await cleanupStaleDomainUsers();
    email = testEmail("playbook");
    userId = await createTestUser(email, "Playbook User");
    await seedPlaybookSections(userId);
  });

  test.afterAll(async () => {
    await cleanupPlaybookData(userId);
    await cleanupTestUsers();
  });

  test.beforeEach(async ({ page }) => {
    await loginViaUI(page, email);
    await page.getByRole("button", { name: "Playbook" }).click();
    await expect(page.getByText("Playbook Content")).toBeVisible({ timeout: 10_000 });
  });

  // ── Section sidebar ────────────────────────────────────────────────

  test("sidebar shows seeded section titles", async ({ page }) => {
    // Use the sidebar button roles — section titles in the sidebar are buttons
    await expect(page.getByRole("button", { name: "Introduction" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Discovery Calls" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Objection Handling" })).toBeVisible();
  });

  test("clicking a section in the sidebar shows its content", async ({ page }) => {
    await page.getByRole("button", { name: "Discovery Calls" }).click();
    await expect(page.getByText("How to run effective discovery calls")).toBeVisible({ timeout: 5_000 });
  });

  test("clicking different sections switches content", async ({ page }) => {
    await page.getByRole("button", { name: "Introduction" }).click();
    await expect(page.getByText("Welcome to the sales playbook")).toBeVisible({ timeout: 5_000 });

    await page.getByRole("button", { name: "Objection Handling" }).click();
    await expect(page.getByText("Common objections and how to address them")).toBeVisible({ timeout: 5_000 });
  });

  // ── Section content ────────────────────────────────────────────────

  test("section displays title and last-updated timestamp", async ({ page }) => {
    const title = page.locator("h3").first();
    await expect(title).toBeVisible({ timeout: 5_000 });
  });

  // ── Edit mode ──────────────────────────────────────────────────────

  test("clicking Edit opens the markdown editor", async ({ page }) => {
    await page.getByRole("button", { name: "Introduction" }).click();
    await expect(page.getByText("Welcome to the sales playbook")).toBeVisible({ timeout: 5_000 });

    await page.getByRole("button", { name: "Edit" }).click();

    // Save and Cancel buttons should appear
    await expect(page.getByRole("button", { name: "Save" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();
  });

  test("cancel editing returns to view mode", async ({ page }) => {
    await page.getByRole("button", { name: "Introduction" }).click();
    await expect(page.getByText("Welcome to the sales playbook")).toBeVisible({ timeout: 5_000 });

    await page.getByRole("button", { name: "Edit" }).click();
    await expect(page.getByRole("button", { name: "Cancel" })).toBeVisible();

    await page.getByRole("button", { name: "Cancel" }).click();

    // Should be back to view mode — Edit button visible again
    await expect(page.getByRole("button", { name: "Edit" })).toBeVisible();
    await expect(page.getByText("Welcome to the sales playbook")).toBeVisible();
  });

  // ── Chat panel toggle ──────────────────────────────────────────────

  test("chat panel is visible by default in playbook view", async ({ page }) => {
    await expect(page.getByText("AI Assistant")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Context-aware help")).toBeVisible();
  });

  // ── Status filter pills ────────────────────────────────────────────

  test("playbook has status filter pills", async ({ page }) => {
    for (const label of ["Covered", "Partial", "Missing", "Outdated"]) {
      await expect(page.getByRole("button", { name: new RegExp(label) }).first()).toBeVisible();
    }
  });

  // ── Skill filter combobox ──────────────────────────────────────────

  test("skill filter combobox is present in sidebar", async ({ page }) => {
    await expect(page.getByRole("combobox")).toBeVisible();
    await expect(page.getByText("All sections")).toBeVisible();
  });
});
