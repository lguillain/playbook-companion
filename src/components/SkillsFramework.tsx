import { motion } from "framer-motion";
import { skillsFramework } from "@/lib/mock-data";
import { CheckCircle2, AlertTriangle, XCircle, Clock } from "lucide-react";

const statusConfig = {
  covered: { icon: CheckCircle2, label: "Covered", color: "text-success", bg: "bg-success/10", border: "border-success/20" },
  partial: { icon: Clock, label: "Partial", color: "text-primary", bg: "bg-primary/10", border: "border-primary/20" },
  missing: { icon: XCircle, label: "Missing", color: "text-warning", bg: "bg-warning/10", border: "border-warning/20" },
};

export const SkillsFramework = ({ onFillGap }: { onFillGap?: (skillName: string) => void }) => {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.1 }}
      className="rounded-xl border border-border bg-card p-6 shadow-card"
    >
      <div className="flex items-center justify-between mb-5">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Skills Framework</h2>
          <p className="text-sm text-muted-foreground mt-1">Coverage across sales competencies</p>
        </div>
      </div>

      <div className="space-y-4">
        {skillsFramework.map((category, catIdx) => {
          const covered = category.skills.filter(s => s.status === "covered").length;
          const pct = Math.round((covered / category.skills.length) * 100);

          return (
            <motion.div
              key={category.id}
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.15 + catIdx * 0.05 }}
            >
              <div className="flex items-center justify-between mb-2">
                <span className="text-sm font-semibold text-foreground">{category.name}</span>
                <span className="text-xs font-mono text-muted-foreground">{pct}%</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted mb-3 overflow-hidden">
                <motion.div
                  className="h-full rounded-full gradient-primary"
                  initial={{ width: 0 }}
                  animate={{ width: `${pct}%` }}
                  transition={{ duration: 1, delay: 0.3 + catIdx * 0.1 }}
                />
              </div>
              <div className="grid gap-1.5">
                {category.skills.map((skill) => {
                  const config = statusConfig[skill.status];
                  const Icon = config.icon;
                  const isActionable = skill.status === "missing" || skill.status === "partial";

                  return (
                    <div
                      key={skill.id}
                      className={`flex items-center justify-between rounded-lg px-3 py-2 border ${config.bg} ${config.border} ${isActionable ? "cursor-pointer hover:brightness-110 transition-all" : ""}`}
                      onClick={() => isActionable && onFillGap?.(skill.name)}
                    >
                      <div className="flex items-center gap-2">
                        <Icon className={`w-3.5 h-3.5 ${config.color}`} />
                        <span className="text-sm text-foreground font-medium">{skill.name}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        {skill.lastUpdated && (
                          <span className="text-[10px] font-mono text-muted-foreground">
                            {skill.lastUpdated}
                          </span>
                        )}
                        {isActionable && (
                          <span className="text-[10px] font-semibold text-primary">Fill →</span>
                        )}
                      </div>
                    </div>
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
