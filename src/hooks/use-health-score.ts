import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSkills } from "./use-skills";
import { computeHealthScore } from "@/lib/health";
import { supabase } from "@/lib/supabase";
import type { HealthScore } from "@/lib/types";

function useAnalyzedAt() {
  return useQuery<string | null>({
    queryKey: ["analyzed-at"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("profiles")
        .select("analyzed_at")
        .single();
      if (error) throw error;
      return data?.analyzed_at ?? null;
    },
  });
}

export function useHealthScore(): { data: HealthScore | undefined; isLoading: boolean; isRefetching: boolean } {
  const { data: categories, isLoading: skillsLoading, isRefetching: skillsRefetching } = useSkills();
  const { data: analyzedAt, isLoading: analyzedAtLoading } = useAnalyzedAt();

  const data = useMemo(() => {
    if (!categories) return undefined;
    const allSkills = categories.flatMap((c) => c.skills);
    return computeHealthScore(allSkills, analyzedAt);
  }, [categories, analyzedAt]);

  return { data, isLoading: skillsLoading || analyzedAtLoading, isRefetching: skillsRefetching };
}
