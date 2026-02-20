import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { PlaybookSection } from "@/lib/types";

export function usePlaybookSections() {
  const query = useQuery<PlaybookSection[]>({
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
        depth: s.depth ?? 0,
        lastUpdated: s.last_updated,
        provider: s.provider ?? "pdf",
        skillsCovered: (junctions ?? [])
          .filter((j) => j.section_id === s.id)
          .map((j) => ({ skillId: j.skill_id, coverageNote: j.coverage_note ?? null })),
      }));
    },
  });
  return { ...query, isRefetching: query.isFetching && !query.isLoading };
}

export function useResetPlaybook() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      // Order matters: delete junctions first due to foreign keys
      // RLS scopes all deletes to the current user automatically
      const ops = [
        supabase.from("section_skills").delete().neq("skill_id", ""),
        supabase.from("staged_edits").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
        supabase.from("chat_messages").delete().neq("id", "00000000-0000-0000-0000-000000000000"),
      ];
      for (const op of ops) {
        const { error } = await op;
        if (error) throw error;
      }
      // These can run after junctions are cleared
      const { error: secError } = await supabase.from("playbook_sections").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (secError) throw secError;
      const { error: impError } = await supabase.from("imports").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (impError) throw impError;
      const { error: connError } = await supabase.from("connections").delete().neq("id", "00000000-0000-0000-0000-000000000000");
      if (connError) throw connError;
      // Reset all user_skills to missing (RLS scopes to current user)
      const { error: skillError } = await supabase
        .from("user_skills")
        .update({ status: "missing", last_updated: null, section_title: null, coverage_note: null, fulfilled: false })
        .neq("skill_id", "");
      if (skillError) throw skillError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["playbook-sections"] });
      queryClient.invalidateQueries({ queryKey: ["skills"] });
      queryClient.invalidateQueries({ queryKey: ["health-score"] });
      queryClient.invalidateQueries({ queryKey: ["analyzed-at"] });
      queryClient.invalidateQueries({ queryKey: ["staged-edits"] });
      queryClient.invalidateQueries({ queryKey: ["imports"] });
      queryClient.invalidateQueries({ queryKey: ["connections"] });
    },
  });
}

export function useRemoveSource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (provider: string) => {
      // 1. Get section IDs for this provider (RLS scopes to current user)
      const { data: sections, error: fetchErr } = await supabase
        .from("playbook_sections")
        .select("id")
        .eq("provider", provider);
      if (fetchErr) throw fetchErr;
      const ids = (sections ?? []).map((s) => s.id);
      if (ids.length === 0) return;

      // 2. Delete section_skills for those sections
      for (const id of ids) {
        await supabase.from("section_skills").delete().eq("section_id", id);
      }

      // 3. Delete staged_edits for those sections
      for (const id of ids) {
        await supabase.from("staged_edits").delete().eq("section_id", id);
      }

      // 4. Delete the sections themselves
      const { error: delErr } = await supabase
        .from("playbook_sections")
        .delete()
        .eq("provider", provider);
      if (delErr) throw delErr;

      // 5. Re-analyze skills with remaining sections
      const { error: analyzeError } = await supabase.functions.invoke("analyze");
      if (analyzeError) throw analyzeError;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["playbook-sections"] });
      queryClient.invalidateQueries({ queryKey: ["skills"] });
      queryClient.invalidateQueries({ queryKey: ["health-score"] });
      queryClient.invalidateQueries({ queryKey: ["analyzed-at"] });
      queryClient.invalidateQueries({ queryKey: ["staged-edits"] });
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
