import type { Skill, HealthScore } from "./types";

export function computeHealthScore(skills: Skill[]): HealthScore {
  const total = skills.length;
  if (total === 0) return { score: 0, covered: 0, total: 0, partial: 0, missing: 0, outdated: 0 };

  const covered = skills.filter((s) => s.status === "covered").length;
  const partial = skills.filter((s) => s.status === "partial").length;
  const missing = skills.filter((s) => s.status === "missing").length;

  const now = new Date();
  const outdated = skills.filter((s) => {
    if (!s.lastUpdated) return false;
    const diff = now.getTime() - new Date(s.lastUpdated).getTime();
    return diff > 90 * 24 * 60 * 60 * 1000;
  }).length;

  const score = Math.round(((covered + partial * 0.5) / total) * 100);
  return { score, covered, total, partial, missing, outdated };
}
