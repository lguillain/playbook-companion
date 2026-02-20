/**
 * E2E tests for the onboarding flow.
 *
 * Covers: onboarding modal display, source selection, PDF upload trigger.
 *
 * Run with:  npx playwright test e2e/onboarding.spec.ts --project=chromium
 */
import { test, expect } from "@playwright/test";
import {
  createTestUser,
  cleanupTestUsers,
  cleanupStaleDomainUsers,
  loginViaUI,
  testEmail,
  cleanupPlaybookData,
} from "./helpers";

test.describe("Onboarding Flow", () => {
  let userId: string;
  let email: string;

  test.beforeAll(async () => {
    await cleanupStaleDomainUsers();
  });

  test.afterAll(async () => {
    await cleanupTestUsers();
  });

  test.beforeEach(async () => {
    // Create a fresh user with NO playbook data so onboarding appears
    email = testEmail("onboard");
    userId = await createTestUser(email, "Onboard User");
  });

  test.afterEach(async () => {
    await cleanupPlaybookData(userId);
  });

  // ── Onboarding modal ──────────────────────────────────────────────

  test("new user with no playbook sees onboarding modal", async ({ page }) => {
    await loginViaUI(page, email);

    await expect(page.getByText("Connect your playbook")).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText("Choose where your sales playbook lives")).toBeVisible();
  });

  test("onboarding shows four source options", async ({ page }) => {
    await loginViaUI(page, email);

    await expect(page.getByText("Connect your playbook")).toBeVisible({ timeout: 10_000 });

    // Use description text which is unique per source
    await expect(page.getByText("Start with our ready-made sales playbook")).toBeVisible();
    await expect(page.getByText("Connect your Notion workspace")).toBeVisible();
    await expect(page.getByText("Link your Confluence space")).toBeVisible();
    await expect(page.getByText("Upload a playbook PDF")).toBeVisible();
  });

  test("connect button is disabled until a source is selected", async ({ page }) => {
    await loginViaUI(page, email);

    await expect(page.getByText("Connect your playbook")).toBeVisible({ timeout: 10_000 });

    const connectBtn = page.getByRole("button", { name: /Analyze/ });
    await expect(connectBtn).toBeDisabled();
  });

  test("selecting PDF Upload enables the upload button", async ({ page }) => {
    await loginViaUI(page, email);

    await expect(page.getByText("Connect your playbook")).toBeVisible({ timeout: 10_000 });

    // Click the PDF Upload source button (use the unique description)
    await page.getByText("Upload a playbook PDF").click();

    const uploadBtn = page.getByRole("button", { name: "Upload & Analyze" });
    await expect(uploadBtn).toBeEnabled();
  });

  test("selecting Taskbase Playbook shows Use Template & Analyze button", async ({ page }) => {
    await loginViaUI(page, email);

    await expect(page.getByText("Connect your playbook")).toBeVisible({ timeout: 10_000 });

    await page.getByText("Start with our ready-made sales playbook").click();

    const templateBtn = page.getByRole("button", { name: "Use Template & Analyze" });
    await expect(templateBtn).toBeEnabled();
  });

  test("selecting Notion shows Connect & Analyze button", async ({ page }) => {
    await loginViaUI(page, email);

    await expect(page.getByText("Connect your playbook")).toBeVisible({ timeout: 10_000 });

    await page.getByText("Connect your Notion workspace").click();

    const connectBtn = page.getByRole("button", { name: "Connect & Analyze" });
    await expect(connectBtn).toBeEnabled();
  });

  test("selecting Confluence shows Connect & Analyze button", async ({ page }) => {
    await loginViaUI(page, email);

    await expect(page.getByText("Connect your playbook")).toBeVisible({ timeout: 10_000 });

    await page.getByText("Link your Confluence space").click();

    const connectBtn = page.getByRole("button", { name: "Connect & Analyze" });
    await expect(connectBtn).toBeEnabled();
  });

  test("switching between sources updates button text", async ({ page }) => {
    await loginViaUI(page, email);

    await expect(page.getByText("Connect your playbook")).toBeVisible({ timeout: 10_000 });

    // Select Taskbase template
    await page.getByText("Start with our ready-made sales playbook").click();
    await expect(page.getByRole("button", { name: "Use Template & Analyze" })).toBeVisible();

    // Switch to Notion
    await page.getByText("Connect your Notion workspace").click();
    await expect(page.getByRole("button", { name: "Connect & Analyze" })).toBeVisible();

    // Switch to PDF
    await page.getByText("Upload a playbook PDF").click();
    await expect(page.getByRole("button", { name: "Upload & Analyze" })).toBeVisible();

    // Switch to Confluence
    await page.getByText("Link your Confluence space").click();
    await expect(page.getByRole("button", { name: "Connect & Analyze" })).toBeVisible();
  });
});
