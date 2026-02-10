import { motion } from "framer-motion";
import { getHealthScore } from "@/lib/mock-data";
import { XCircle, AlertTriangle, Clock, CheckCircle2 } from "lucide-react";

export const HealthScore = ({ activeFilter, onFilterChange }: { activeFilter: string | null; onFilterChange: (filter: string) => void }) => {
  const health = getHealthScore();
  const healthColor = health.score >= 70 ? "text-success" : health.score >= 40 ? "text-warning" : "text-destructive";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border bg-card px-5 py-3 shadow-card"
    >
      <div className="flex items-center gap-6 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="text-sm font-semibold text-foreground">Playbook Health</span>
          <span className={`text-xl font-bold font-mono ${healthColor}`}>{health.score}</span>
          <span className="text-xs text-muted-foreground">/ 100</span>
        </div>

        <div className="h-5 w-px bg-border" />

        <div className="flex items-center gap-2">
          <FilterPill icon={CheckCircle2} label="Covered" value={health.covered} color="text-success" active={activeFilter === "covered"} onClick={() => onFilterChange("covered")} />
          <FilterPill icon={AlertTriangle} label="Partial" value={health.partial} color="text-warning" active={activeFilter === "partial"} onClick={() => onFilterChange("partial")} />
          <FilterPill icon={XCircle} label="Missing" value={health.missing} color="text-destructive" active={activeFilter === "missing"} onClick={() => onFilterChange("missing")} />
          <FilterPill icon={Clock} label="Outdated" value={health.outdated} color="text-muted-foreground" active={activeFilter === "outdated"} onClick={() => onFilterChange("outdated")} />
        </div>
      </div>
    </motion.div>
  );
};

function FilterPill({ icon: Icon, label, value, color, active, onClick }: { icon: any; label: string; value: number; color: string; active: boolean; onClick: () => void }) {
  return (
    <button
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-all ${active ? "bg-primary/10 ring-2 ring-primary/30" : "bg-muted/50 hover:bg-muted/80"}`}
      onClick={onClick}
    >
      <Icon className={`w-3.5 h-3.5 ${color}`} />
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-bold font-mono ${color}`}>{value}</span>
    </button>
  );
}
