import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { SkillCategory, Skill } from "@/lib/types";

export function useSkills() {
  const query = useQuery<SkillCategory[]>({
    queryKey: ["skills"],
    queryFn: async () => {
      const [catResult, skillResult, userSkillResult] = await Promise.all([
        supabase.from("skill_categories").select("*").order("sort_order"),
        supabase.from("skills").select("*").order("sort_order"),
        supabase.from("user_skills").select("*"), // RLS filters to current user
      ]);

      if (catResult.error) throw catResult.error;
      if (skillResult.error) throw skillResult.error;
      if (userSkillResult.error) throw userSkillResult.error;

      const userSkillMap = new Map(
        (userSkillResult.data ?? []).map((us) => [us.skill_id, us])
      );

      return (catResult.data ?? []).map((cat) => ({
        id: cat.id,
        name: cat.name,
        skills: (skillResult.data ?? [])
          .filter((s) => s.category_id === cat.id)
          .map(
            (s): Skill => {
              const us = userSkillMap.get(s.id);
              return {
                id: s.id,
                name: s.name,
                status: (us?.status as Skill["status"]) ?? "missing",
                lastUpdated: us?.last_updated ?? undefined,
                section: us?.section_title ?? undefined,
                coverageNote: us?.coverage_note ?? undefined,
                fulfilled: us?.fulfilled ?? false,
              };
            }
          ),
      }));
    },
  });
  return { ...query, isRefetching: query.isFetching && !query.isLoading };
}

export function useToggleSkillFulfilled() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ skillId, fulfilled }: { skillId: string; fulfilled: boolean }) => {
      const { error } = await supabase
        .from("user_skills")
        .update({ fulfilled })
        .eq("skill_id", skillId);
      if (error) throw error;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["skills"] }),
  });
}
