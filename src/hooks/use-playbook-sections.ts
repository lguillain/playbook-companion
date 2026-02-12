import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { PlaybookSection } from "@/lib/types";

export function usePlaybookSections() {
  return useQuery<PlaybookSection[]>({
    queryKey: ["playbook-sections"],
    queryFn: async () => {
      const { data: sections, error: secError } = await supabase
        .from("playbook_sections")
        .select("*")
        .order("sort_order");

      if (secError) throw secError;

      const { data: junctions, error: juncError } = await supabase
        .from("section_skills")
        .select("*");

      if (juncError) throw juncError;

      return (sections ?? []).map((s) => ({
        id: s.id,
        title: s.title,
        content: s.content,
        lastUpdated: s.last_updated,
        skillsCovered: (junctions ?? [])
          .filter((j) => j.section_id === s.id)
          .map((j) => j.skill_id),
      }));
    },
  });
}

export function useResetPlaybook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      // Order matters: delete junctions first due to foreign keys
      // RLS scopes all deletes to the current user automatically
      await supabase.from("section_skills").delete().neq("skill_id", "");
      await supabase.from("staged_edits").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("chat_messages").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("playbook_sections").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("imports").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      await supabase.from("connections").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      // Reset all user_skills to missing (RLS scopes to current user)
      await supabase
        .from("user_skills")
        .update({ status: "missing", last_updated: null, section_title: null })
        .neq("skill_id", "");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["playbook-sections"] });
      queryClient.invalidateQueries({ queryKey: ["skills"] });
      queryClient.invalidateQueries({ queryKey: ["health-score"] });
      queryClient.invalidateQueries({ queryKey: ["staged-edits"] });
      queryClient.invalidateQueries({ queryKey: ["imports"] });
      queryClient.invalidateQueries({ queryKey: ["connections"] });
    },
  });
}

export function useUpdateSection() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ id, content }: { id: string; content: string }) => {
      const { error } = await supabase
        .from("playbook_sections")
        .update({ content, last_updated: new Date().toISOString().split("T")[0] })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["playbook-sections"] });
    },
  });
}
