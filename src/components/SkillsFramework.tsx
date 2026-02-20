import { motion } from "framer-motion";
import { useSkills, useToggleSkillFulfilled } from "@/hooks/use-skills";
import { CheckCircle2, AlertTriangle, XCircle, Loader2 } from "lucide-react";
import { HoverCard, HoverCardTrigger, HoverCardContent } from "@/components/ui/hover-card";

const statusConfig = {
  covered: { icon: CheckCircle2, label: "Covered", color: "text-success", bg: "bg-success/10", border: "border-success/20" },
  partial: { icon: AlertTriangle, label: "Partial", color: "text-warning", bg: "bg-warning/10", border: "border-warning/20" },
  missing: { icon: XCircle, label: "Missing", color: "text-destructive", bg: "bg-destructive/10", border: "border-destructive/20" },
};

const isSkillOutdated = (lastUpdated?: string) => {
  if (!lastUpdated) return false;
  return (new Date().getTime() - new Date(lastUpdated).getTime()) > 90 * 24 * 60 * 60 * 1000;
};

export const SkillsFramework = ({ onFillGap, statusFilter }: { onFillGap?: (skillId: string, skillName: string) => void; statusFilter?: string | null }) => {
  const { data: skillsFramework, isLoading, isRefetching } = useSkills();
  const toggleFulfilled = useToggleSkillFulfilled();

  if (isLoading || !skillsFramework) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 shadow-card flex items-center justify-center min-h-[300px]">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="rounded-xl border border-border bg-card p-6 shadow-card"
    >
      <div className="flex items-center justify-between mb-5">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg text-foreground">Knowledge Areas</h2>
            {isRefetching && <Loader2 className="w-3.5 h-3.5 text-muted-foreground animate-spin" />}
          </div>
          <p className="text-sm text-muted-foreground mt-1">Coverage across sales competencies</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {skillsFramework.map((category, catIdx) => {
          const covered = category.skills.filter(s => s.status === "covered").length;
          const pct = Math.round((covered / category.skills.length) * 100);

          const filteredSkills = statusFilter
            ? category.skills.filter(s =>
                statusFilter === "outdated" ? isSkillOutdated(s.lastUpdated) : s.status === statusFilter
              )
            : category.skills;

          if (statusFilter && filteredSkills.length === 0) return null;

          return (
            <motion.div
              key={category.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.15 + catIdx * 0.04 }}
              className="rounded-lg border border-border/60 bg-muted/20 p-4"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-subheading text-foreground">{category.name}</span>
                <span className="text-xs font-mono text-muted-foreground">{statusFilter ? `${filteredSkills.length} of ${category.skills.length}` : `${pct}%`}</span>
              </div>
              {!statusFilter && (
                <div className="h-1.5 rounded-full bg-muted mb-3 overflow-hidden">
                  <motion.div
                    className="h-full rounded-full gradient-primary"
                    initial={{ width: 0 }}
                    animate={{ width: `${pct}%` }}
                    transition={{ duration: 1, delay: 0.3 + catIdx * 0.08 }}
                  />
                </div>
              )}
              <div className={`grid gap-1.5 ${statusFilter ? "mt-1" : ""}`}>
                {filteredSkills.map((skill) => {
                  const config = statusConfig[skill.status];
                  const Icon = config.icon;
                  const outdated = isSkillOutdated(skill.lastUpdated);
                  const isActionable = skill.status === "missing" || skill.status === "partial" || outdated;
                  const showFulfilledToggle = skill.status !== "covered";

                  const row = (
                    <div
                      className={`flex items-center justify-between rounded-lg px-3 py-2 border ${skill.fulfilled ? "bg-muted/30 border-border/40" : `${config.bg} ${config.border}`} ${isActionable && !skill.fulfilled ? "cursor-pointer hover:brightness-110 transition-all" : "transition-all"}`}
                      onClick={() => isActionable && !skill.fulfilled && onFillGap?.(skill.id, skill.name)}
                    >
                      <div className="flex items-center gap-2">
                        <Icon className={`w-3.5 h-3.5 ${skill.fulfilled ? "text-muted-foreground" : config.color}`} />
                        <span className={`text-sm font-subheading ${skill.fulfilled ? "text-muted-foreground line-through" : "text-foreground"}`}>{skill.name}</span>
                        {skill.fulfilled && (
                          <span className="text-[10px] text-muted-foreground italic">Dismissed</span>
                        )}
                      </div>
                      <div className="flex items-center gap-2">
                        {skill.lastUpdated && !skill.fulfilled && (
                          <span className={`text-[10px] font-mono ${outdated ? "text-destructive font-caption" : "text-muted-foreground"}`}>
                            {new Date(skill.lastUpdated).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                          </span>
                        )}
                        {isActionable && !skill.fulfilled && (
                          <span className="text-[10px] font-caption text-primary">{outdated && skill.status === "covered" ? "Update →" : "Fill →"}</span>
                        )}
                      </div>
                    </div>
                  );

                  if (!showFulfilledToggle) return <div key={skill.id}>{row}</div>;
                  return (
                    <HoverCard key={skill.id} openDelay={300} closeDelay={200}>
                      <HoverCardTrigger asChild>{row}</HoverCardTrigger>
                      <HoverCardContent side="right" className="w-auto max-w-xs p-2 text-xs">
                        <div className="flex flex-col gap-1.5">
                          {skill.coverageNote && <p className="text-muted-foreground">{skill.coverageNote}</p>}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleFulfilled.mutate({ skillId: skill.id, fulfilled: !skill.fulfilled });
                            }}
                            className="text-[11px] font-subheading text-foreground hover:text-primary transition-colors text-left"
                          >
                            {skill.fulfilled ? "Undo" : "Dismiss"}
                          </button>
                        </div>
                      </HoverCardContent>
                    </HoverCard>
                  );
                })}
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
};
