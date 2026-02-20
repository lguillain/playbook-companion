/**
 * E2E tests for the Review & Publish (staging) tab.
 *
 * Covers: empty state, staged edit display, accept/dismiss actions.
 *
 * Run with:  npx playwright test e2e/review-publish.spec.ts --project=chromium
 */
import { test, expect } from "@playwright/test";
import {
  admin,
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

test.describe("Review & Publish", () => {
  test.beforeAll(async () => {
    await cleanupStaleDomainUsers();
    email = testEmail("staging");
    userId = await createTestUser(email, "Staging User");
    await seedPlaybookSections(userId);
  });

  test.afterAll(async () => {
    await cleanupPlaybookData(userId);
    await cleanupTestUsers();
  });

  test.beforeEach(async ({ page }) => {
    await loginViaUI(page, email);
    await page.getByRole("button", { name: "Review & Publish" }).click();
  });

  // ── Empty state ────────────────────────────────────────────────────

  test("shows empty state when no edits exist", async ({ page }) => {
    await expect(
      page.getByText(/no suggested changes yet|use the chat to get started/i),
    ).toBeVisible({ timeout: 10_000 });
  });

  test("Notify team button is visible", async ({ page }) => {
    await expect(page.getByRole("button", { name: /notify team/i })).toBeVisible({
      timeout: 10_000,
    });
  });

  // ── With staged edits ──────────────────────────────────────────────

  test.describe("with a seeded staged edit", () => {
    let sectionId: string;
    let editId: string;

    test.beforeAll(async () => {
      // Find one of the seeded sections
      const { data: sections } = await admin
        .from("playbook_sections")
        .select("id, title")
        .eq("user_id", userId)
        .limit(1)
        .single();
      sectionId = sections!.id;

      // Insert a staged edit
      const { data: edit } = await admin
        .from("staged_edits")
        .insert({
          section_id: sectionId,
          before_text: "Old content here",
          after_text: "New improved content here",
          status: "pending",
          source: "chat",
          created_by: userId,
        })
        .select("id")
        .single();
      editId = edit!.id;
    });

    test.afterAll(async () => {
      await admin.from("staged_edits").delete().eq("id", editId);
    });

    test("staged edit appears with Needs review badge", async ({ page }) => {
      await expect(page.getByText("Needs review")).toBeVisible({ timeout: 10_000 });
    });

    test("staged edit shows AI suggestion label", async ({ page }) => {
      await expect(page.getByText("AI suggestion")).toBeVisible({ timeout: 10_000 });
    });

    test("staged edit has Accept and Dismiss action buttons", async ({ page }) => {
      await expect(page.getByRole("button", { name: /accept/i })).toBeVisible({
        timeout: 10_000,
      });
      await expect(page.getByRole("button", { name: /dismiss/i })).toBeVisible();
    });

    test("staged edit has Edit button", async ({ page }) => {
      await expect(page.getByRole("button", { name: /^edit$/i })).toBeVisible({
        timeout: 10_000,
      });
    });

    test("to-review count badge is shown", async ({ page }) => {
      await expect(page.getByText(/\d+ to review/)).toBeVisible({ timeout: 10_000 });
    });
  });
});
