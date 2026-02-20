/**
 * Shared helpers for Playwright e2e tests.
 *
 * Requires local Supabase running (`supabase start`) and dev server on localhost:8080.
 */
import { createClient } from "@supabase/supabase-js";
import type { Page } from "@playwright/test";

// ── Supabase admin client ────────────────────────────────────────────

export const SUPABASE_URL = "http://127.0.0.1:54321";
export const SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";
export const ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0";

export const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Test user management ─────────────────────────────────────────────

export const TEST_DOMAIN = "pw-e2e-test.example.com";
export const TEST_PASSWORD = "testpassword123";

const trackedUserIds: string[] = [];

/** Create a confirmed user via the admin API (no email verification needed). */
export async function createTestUser(
  email: string,
  fullName = email.split("@")[0],
): Promise<string> {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: fullName },
  });
  if (error) throw new Error(`Failed to create ${email}: ${error.message}`);
  trackedUserIds.push(data.user.id);
  return data.user.id;
}

/** Delete a specific user by ID. */
export async function deleteUser(userId: string): Promise<void> {
  await admin.auth.admin.deleteUser(userId).catch(() => {});
}

/** Clean up all users created via createTestUser in this process. */
export async function cleanupTestUsers(): Promise<void> {
  for (const id of [...trackedUserIds].reverse()) {
    await deleteUser(id);
  }
  trackedUserIds.length = 0;
}

/** Clean up any leftover users from previous test runs matching our test domain. */
export async function cleanupStaleDomainUsers(): Promise<void> {
  const { data } = await admin.auth.admin.listUsers();
  if (data?.users) {
    for (const u of data.users) {
      if (u.email?.endsWith(`@${TEST_DOMAIN}`)) {
        await admin.auth.admin.deleteUser(u.id);
      }
    }
  }
}

// ── Browser helpers ──────────────────────────────────────────────────

/** Log in through the UI (navigates to /login, fills form, submits). */
export async function loginViaUI(
  page: Page,
  email: string,
  password = TEST_PASSWORD,
): Promise<void> {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
  // Wait until we leave /login (lands on / for dashboard, or / with onboarding/waitlist)
  await page.waitForURL((url) => !url.pathname.includes("/login"), { timeout: 15_000 });
}

/** Sign up through the UI. */
export async function signupViaUI(
  page: Page,
  opts: { name: string; email: string; password?: string },
): Promise<void> {
  await page.goto("/signup");
  await page.getByLabel("Full name").fill(opts.name);
  await page.getByLabel("Email").fill(opts.email);
  await page.getByLabel("Password").fill(opts.password ?? TEST_PASSWORD);
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create account" }).click();
}

/** Generate a unique test email. */
export function testEmail(label: string): string {
  return `${label}-${Date.now()}@${TEST_DOMAIN}`;
}

/** Seed minimal playbook sections for a user so the onboarding modal doesn't appear. */
export async function seedPlaybookSections(userId: string): Promise<void> {
  const sections = [
    { user_id: userId, title: "Introduction", content: "# Introduction\n\nWelcome to the sales playbook.", depth: 0, sort_order: 0 },
    { user_id: userId, title: "Discovery Calls", content: "# Discovery Calls\n\nHow to run effective discovery calls with prospects.", depth: 0, sort_order: 1 },
    { user_id: userId, title: "Objection Handling", content: "# Objection Handling\n\nCommon objections and how to address them.\n\n## Pricing Objections\n\nWhen prospects push back on pricing...\n\n## Timing Objections\n\nWhen prospects say it's not the right time...", depth: 0, sort_order: 2 },
  ];

  const { error } = await admin.from("playbook_sections").insert(sections);
  if (error) throw new Error(`Failed to seed sections: ${error.message}`);
}

/** Clean up playbook data for a user. Silently ignores errors (data may already be deleted). */
export async function cleanupPlaybookData(userId: string): Promise<void> {
  try { await admin.from("staged_edits").delete().eq("created_by", userId); } catch {}
  try { await admin.from("chat_messages").delete().eq("created_by", userId); } catch {}
  try { await admin.from("playbook_sections").delete().eq("user_id", userId); } catch {}
}
