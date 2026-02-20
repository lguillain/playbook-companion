/**
 * E2E tests for chat functionality.
 *
 * Covers: sending messages, AI streaming responses, staged edits (accept/reject),
 * chat history persistence, embedded chat in the Playbook tab.
 *
 * Run with:  npx playwright test e2e/chat.spec.ts --project=chromium
 * Requires:  local Supabase running, dev server on :8080, ANTHROPIC_API_KEY in supabase/functions/.env
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

test.describe("Chat", () => {
  test.beforeAll(async () => {
    await cleanupStaleDomainUsers();
    email = testEmail("chat");
    userId = await createTestUser(email, "Chat User");
    await seedPlaybookSections(userId);
  });

  test.afterAll(async () => {
    await cleanupPlaybookData(userId);
    await cleanupTestUsers();
  });

  test.beforeEach(async ({ page }) => {
    // Clean chat data so prior conversations don't influence responses
    await admin.from("staged_edits").delete().eq("created_by", userId);
    await admin.from("chat_messages").delete().eq("created_by", userId);
    await loginViaUI(page, email);
  });

  // ── Group 1: Dashboard Chat — UI Interactions ────────────────────

  test("sending a message shows user bubble and clears input", async ({ page }) => {
    const textarea = page.getByPlaceholder(/ask me/i);
    await expect(textarea).toBeVisible({ timeout: 10_000 });

    await textarea.fill("Hello, this is a test message");
    await textarea.press("Enter");

    // User bubble should appear with the message text
    await expect(page.getByText("Hello, this is a test message")).toBeVisible({ timeout: 5_000 });

    // Input should be cleared
    await expect(textarea).toHaveValue("");
  });

  test("Enter sends message, Shift+Enter inserts newline", async ({ page }) => {
    const textarea = page.getByPlaceholder(/ask me/i);
    await expect(textarea).toBeVisible({ timeout: 10_000 });

    // Shift+Enter should insert a newline, not send
    await textarea.fill("Line one");
    await textarea.press("Shift+Enter");
    await textarea.type("Line two");

    // Textarea should still contain text (not sent)
    await expect(textarea).toContainText("Line one");
    await expect(textarea).toContainText("Line two");

    // Now press Enter to send
    await textarea.press("Enter");

    // Input should be cleared after sending
    await expect(textarea).toHaveValue("");

    // The user message should appear
    await expect(page.getByText(/Line one/)).toBeVisible({ timeout: 5_000 });
  });

  // ── Group 2: Dashboard Chat — AI Round-trip ──────────────────────

  test("assistant response appears after sending", async ({ page }) => {
    const textarea = page.getByPlaceholder(/ask me/i);
    await expect(textarea).toBeVisible({ timeout: 10_000 });

    await textarea.fill("What is a sales playbook?");
    await textarea.press("Enter");

    // Wait for streaming to complete — textarea re-enables when done
    await expect(textarea).toBeEnabled({ timeout: 45_000 });

    // There should be at least 2 assistant bubbles: the welcome message + the response.
    // Assistant bubbles use bg-muted with rounded-xl px-4 py-3.
    const assistantBubbles = page.locator(".bg-muted.rounded-xl.px-4.py-3");
    await expect(async () => {
      expect(await assistantBubbles.count()).toBeGreaterThanOrEqual(2);
    }).toPass({ timeout: 5_000 });
  });

  test("textarea is disabled while streaming", async ({ page }) => {
    const textarea = page.getByPlaceholder(/ask me/i);
    await expect(textarea).toBeVisible({ timeout: 10_000 });

    await textarea.fill("Give me a brief tip for discovery calls");
    await textarea.press("Enter");

    // Textarea should become disabled during streaming
    await expect(textarea).toBeDisabled({ timeout: 5_000 });

    // Wait for streaming to finish
    await expect(textarea).toBeEnabled({ timeout: 45_000 });
  });

  test("chat history persists after page reload", async ({ page }) => {
    const textarea = page.getByPlaceholder(/ask me/i);
    await expect(textarea).toBeVisible({ timeout: 10_000 });

    await textarea.fill("Remember this test phrase: pineapple lighthouse");
    await textarea.press("Enter");

    // Wait for response to complete
    await expect(textarea).toBeEnabled({ timeout: 45_000 });

    // Reload the page
    await page.reload();

    // After reload, the user message should still appear from DB history
    await expect(page.getByText("pineapple lighthouse")).toBeVisible({ timeout: 10_000 });
  });

  // ── Group 3: Staged Edits via Chat ───────────────────────────────

  test("explicit edit prompt produces a DiffCard", async ({ page }) => {
    const textarea = page.getByPlaceholder(/ask me/i);
    await expect(textarea).toBeVisible({ timeout: 10_000 });

    await textarea.fill(
      'Edit the Introduction section: replace the first line with "Welcome to our comprehensive sales playbook guide."'
    );
    await textarea.press("Enter");

    // Wait for streaming to complete
    await expect(textarea).toBeEnabled({ timeout: 45_000 });

    // A DiffCard should appear with Accept and Reject buttons
    await expect(async () => {
      const acceptBtn = page.getByRole("button", { name: /Accept/i });
      expect(await acceptBtn.count()).toBeGreaterThanOrEqual(1);
    }).toPass({ timeout: 10_000 });

    // Expand button should also be visible on the DiffCard
    await expect(page.getByText("Expand").first()).toBeVisible();
  });

  test("accepting a staged edit shows accepted state", async ({ page }) => {
    const textarea = page.getByPlaceholder(/ask me/i);
    await expect(textarea).toBeVisible({ timeout: 10_000 });

    await textarea.fill(
      'Edit the Introduction section: replace the first line with "Updated introduction for acceptance test."'
    );
    await textarea.press("Enter");

    // Wait for streaming to complete
    await expect(textarea).toBeEnabled({ timeout: 45_000 });

    // Wait for Accept button to appear
    const acceptBtn = page.getByRole("button", { name: /Accept/i }).first();
    await expect(acceptBtn).toBeVisible({ timeout: 10_000 });

    await acceptBtn.click();

    // Should show "accepted" status badge
    await expect(page.getByText("accepted").first()).toBeVisible({ timeout: 10_000 });

    // Success toast
    await expect(page.getByText("Edit approved and applied!")).toBeVisible({ timeout: 5_000 });
  });

  test("rejecting a staged edit shows rejected state", async ({ page }) => {
    const textarea = page.getByPlaceholder(/ask me/i);
    await expect(textarea).toBeVisible({ timeout: 10_000 });

    await textarea.fill(
      'Edit the Introduction section: replace the first line with "This edit will be rejected."'
    );
    await textarea.press("Enter");

    // Wait for streaming to complete
    await expect(textarea).toBeEnabled({ timeout: 45_000 });

    // Wait for Reject button to appear
    const rejectBtn = page.getByRole("button", { name: /Reject/i }).first();
    await expect(rejectBtn).toBeVisible({ timeout: 10_000 });

    await rejectBtn.click();

    // Should show "rejected" status badge
    await expect(page.getByText("rejected").first()).toBeVisible({ timeout: 10_000 });

    // Success toast
    await expect(page.getByText("Edit rejected")).toBeVisible({ timeout: 5_000 });
  });

  // ── Group 4: Embedded Chat in Playbook Tab ───────────────────────

  test("embedded chat shows section-specific welcome", async ({ page }) => {
    await page.getByRole("button", { name: "Playbook" }).click();
    await expect(page.getByText("Playbook Content")).toBeVisible({ timeout: 10_000 });

    // Select the Introduction section
    await page.getByRole("button", { name: "Introduction" }).click();

    // Embedded chat should show section-specific welcome
    await expect(page.getByText("You're viewing:")).toBeVisible({ timeout: 5_000 });
    await expect(page.getByText("Context-aware help")).toBeVisible();
  });

  test("can send a message in embedded chat", async ({ page }) => {
    await page.getByRole("button", { name: "Playbook" }).click();
    await expect(page.getByText("Playbook Content")).toBeVisible({ timeout: 10_000 });

    await page.getByRole("button", { name: "Introduction" }).click();

    // The embedded chat textarea
    const textarea = page.getByPlaceholder(/ask me/i);
    await expect(textarea).toBeVisible({ timeout: 5_000 });

    await textarea.fill("What does this section cover?");
    await textarea.press("Enter");

    // User message should appear
    await expect(page.getByText("What does this section cover?")).toBeVisible({ timeout: 5_000 });

    // Wait for streaming to finish
    await expect(textarea).toBeEnabled({ timeout: 45_000 });

    // At least 2 assistant bubbles: welcome + response
    const assistantBubbles = page.locator(".bg-muted.rounded-xl.px-4.py-3");
    await expect(async () => {
      expect(await assistantBubbles.count()).toBeGreaterThanOrEqual(2);
    }).toPass({ timeout: 5_000 });
  });

  test("switching sections resets the chat", async ({ page }) => {
    await page.getByRole("button", { name: "Playbook" }).click();
    await expect(page.getByText("Playbook Content")).toBeVisible({ timeout: 10_000 });

    // Select Introduction
    await page.getByRole("button", { name: "Introduction" }).click();
    await expect(page.getByText("You're viewing:")).toBeVisible({ timeout: 5_000 });

    // Send a message
    const textarea = page.getByPlaceholder(/ask me/i);
    await textarea.fill("Test message in Introduction");
    await textarea.press("Enter");
    await expect(page.getByText("Test message in Introduction")).toBeVisible({ timeout: 5_000 });

    // Switch to Discovery Calls
    await page.getByRole("button", { name: "Discovery Calls" }).click();

    // The old user message should no longer be visible (chat was reset)
    await expect(page.getByText("Test message in Introduction")).not.toBeVisible({ timeout: 5_000 });

    // The welcome message should now reference the new section
    await expect(page.getByText("You're viewing:")).toBeVisible({ timeout: 5_000 });
  });
});
