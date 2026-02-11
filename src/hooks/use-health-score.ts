import { useMemo } from "react";
import { useSkills } from "./use-skills";
import { computeHealthScore } from "@/lib/health";
import type { HealthScore } from "@/lib/types";

export function useHealthScore(): { data: HealthScore | undefined; isLoading: boolean } {
  const { data: categories, isLoading } = useSkills();

  const data = useMemo(() => {
    if (!categories) return undefined;
    const allSkills = categories.flatMap((c) => c.skills);
    return computeHealthScore(allSkills);
  }, [categories]);

  return { data, isLoading };
}
