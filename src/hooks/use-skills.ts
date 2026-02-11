import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase";
import type { SkillCategory, Skill } from "@/lib/types";

export function useSkills() {
  return useQuery<SkillCategory[]>({
    queryKey: ["skills"],
    queryFn: async () => {
      const { data: categories, error: catError } = await supabase
        .from("skill_categories")
        .select("*")
        .order("sort_order");

      if (catError) throw catError;

      const { data: skills, error: skillError } = await supabase
        .from("skills")
        .select("*")
        .order("sort_order");

      if (skillError) throw skillError;

      return (categories ?? []).map((cat) => ({
        id: cat.id,
        name: cat.name,
        skills: (skills ?? [])
          .filter((s) => s.category_id === cat.id)
          .map(
            (s): Skill => ({
              id: s.id,
              name: s.name,
              status: s.status as Skill["status"],
              lastUpdated: s.last_updated ?? undefined,
              section: s.section_title ?? undefined,
            })
          ),
      }));
    },
  });
}
