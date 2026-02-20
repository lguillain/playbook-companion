import { createClient } from "jsr:@supabase/supabase-js@2";

type SupabaseAdmin = ReturnType<typeof createClient>;

/**
 * Delete only the sections belonging to a specific provider for a user,
 * along with their related section_skills, staged_edits, and chat_message references.
 *
 * Does NOT reset user_skills — the caller should run analyzeSections afterwards
 * which handles that.
 */
export async function scopedDeleteByProvider(
  adminClient: SupabaseAdmin,
  userId: string,
  provider: string,
): Promise<void> {
  // 1. Get section IDs for this (user, provider)
  const { data: sections } = await adminClient
    .from("playbook_sections")
    .select("id")
    .eq("user_id", userId)
    .eq("provider", provider);

  const ids = (sections ?? []).map((s: { id: string }) => s.id);

  if (ids.length === 0) return;

  // 2. Delete section_skills for those sections
  await adminClient
    .from("section_skills")
    .delete()
    .in("section_id", ids);

  // 3. Delete staged_edits for those sections
  await adminClient
    .from("staged_edits")
    .delete()
    .in("section_id", ids);

  // 4. Nullify chat_messages.section_id (preserve chat history)
  await adminClient
    .from("chat_messages")
    .update({ section_id: null })
    .in("section_id", ids);

  // 5. Delete the sections themselves
  await adminClient
    .from("playbook_sections")
    .delete()
    .in("id", ids);
}
