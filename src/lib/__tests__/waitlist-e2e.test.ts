/**
 * E2E test for the waitlist feature.
 *
 * Runs against the local Supabase instance. Requires:
 *   - `supabase start` (already running)
 *   - migration 00014_waitlist.sql applied (`supabase db reset`)
 *
 * What it does:
 *   1. Cleans up any test users from previous runs
 *   2. Creates 10 external users → all should be 'active'
 *   3. Creates an 11th external user → should be 'waitlisted'
 *   4. Creates a @taskbase.com user → always 'active'
 *   5. Activates the waitlisted user via SQL helper → becomes 'active'
 *   6. Cleans up all test users
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";

const SUPABASE_URL = "http://127.0.0.1:54321";
const SERVICE_ROLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImV4cCI6MTk4MzgxMjk5Nn0.EGIM96RAZx35lJzdJsyH-qQwv8Hdp7fsn3W0YpN81IU";

const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const TEST_EMAIL_DOMAIN = "waitlist-test.example.com";
const testEmail = (n: number) => `user${n}@${TEST_EMAIL_DOMAIN}`;
const taskbaseEmail = `tester@taskbase.com`;
const PASSWORD = "testpassword123";

const createdUserIds: string[] = [];

async function createUser(email: string) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
    user_metadata: { full_name: email.split("@")[0] },
  });
  if (error) throw new Error(`Failed to create ${email}: ${error.message}`);
  createdUserIds.push(data.user.id);
  return data.user;
}

async function getProfileStatus(userId: string): Promise<string> {
  const { data, error } = await admin
    .from("profiles")
    .select("status")
    .eq("id", userId)
    .single();
  if (error) throw new Error(`Failed to get profile for ${userId}: ${error.message}`);
  return data.status;
}

async function cleanup() {
  // Delete in reverse order to avoid issues
  for (const id of [...createdUserIds].reverse()) {
    await admin.auth.admin.deleteUser(id).catch(() => {});
  }
  createdUserIds.length = 0;
}

// Count external active users that existed before our test
let preExistingExternalActive = 0;

describe("Waitlist e2e", { timeout: 30_000 }, () => {
  beforeAll(async () => {
    // Clean up any leftover test users from previous runs
    const { data: existingUsers } = await admin.auth.admin.listUsers();
    if (existingUsers?.users) {
      for (const u of existingUsers.users) {
        if (u.email?.endsWith(`@${TEST_EMAIL_DOMAIN}`) || u.email === taskbaseEmail) {
          await admin.auth.admin.deleteUser(u.id);
        }
      }

      // Count pre-existing external active users
      for (const u of existingUsers.users) {
        if (u.email && !u.email.endsWith(`@${TEST_EMAIL_DOMAIN}`) && !u.email.endsWith("@taskbase.com")) {
          const status = await getProfileStatus(u.id).catch(() => null);
          if (status === "active") preExistingExternalActive++;
        }
      }
    }
  });

  afterAll(async () => {
    await cleanup();
  });

  it("gives 'active' status to the first 10 external users", async () => {
    const spotsRemaining = 10 - preExistingExternalActive;

    for (let i = 1; i <= spotsRemaining; i++) {
      const user = await createUser(testEmail(i));
      const status = await getProfileStatus(user.id);
      expect(status, `user${i} should be active`).toBe("active");
    }
  });

  it("waitlists the 11th external user", async () => {
    const user = await createUser(testEmail(99));
    const status = await getProfileStatus(user.id);
    expect(status).toBe("waitlisted");
  });

  it("always gives 'active' to @taskbase.com emails regardless of cap", async () => {
    const user = await createUser(taskbaseEmail);
    const status = await getProfileStatus(user.id);
    expect(status).toBe("active");
  });

  it("activate_waitlisted_user() moves a user from waitlisted to active", async () => {
    const email = testEmail(99);

    // Verify still waitlisted
    const before = await admin
      .from("profiles")
      .select("status")
      .eq("id", createdUserIds.find((_, i) => i === createdUserIds.length - 2)!) // user99
      .single();
    expect(before.data?.status).toBe("waitlisted");

    // Call the admin helper
    const { error } = await admin.rpc("activate_waitlisted_user", { _email: email });
    expect(error).toBeNull();

    // Verify now active
    const userId = createdUserIds[createdUserIds.length - 2];
    const after = await getProfileStatus(userId);
    expect(after).toBe("active");
  });
});
