import { motion } from "framer-motion";
import { useHealthScore } from "@/hooks/use-health-score";
import { useReAnalyze } from "@/hooks/use-import";
import { XCircle, AlertTriangle, Clock, CheckCircle2, Loader2, Info, RefreshCw } from "lucide-react";
import { Tooltip, TooltipTrigger, TooltipContent } from "@/components/ui/tooltip";

export const HealthScore = ({ activeFilter, onFilterChange }: { activeFilter: string | null; onFilterChange: (filter: string) => void }) => {
  const { data: health, isLoading, isRefetching } = useHealthScore();
  const reAnalyze = useReAnalyze();

  if (isLoading || !health) {
    return (
      <div className="rounded-xl border border-border bg-card px-5 py-3 shadow-card flex items-center justify-center min-h-[52px]">
        <Loader2 className="w-4 h-4 text-primary animate-spin" />
      </div>
    );
  }

  const healthColor = health.score >= 70 ? "text-success" : health.score >= 40 ? "text-warning" : "text-destructive";

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border bg-card px-5 py-3 shadow-card"
    >
      <div className="flex items-center gap-6 flex-wrap">
        <div className="flex items-center gap-3">
          <span className="text-sm font-subheading text-foreground">Playbook Health</span>
          <span className={`text-xl font-overline font-mono ${healthColor}`}>{health.score}</span>
          <span className="text-xs text-muted-foreground">/ 100</span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Info className="w-3.5 h-3.5 text-muted-foreground cursor-help" />
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-xs text-xs leading-relaxed">
              <p>Score = (covered + partial × 0.5) / total skills × 100</p>
              <p className="mt-1 text-muted-foreground">Fully covered skills count 100%, partially covered count 50%. Skills not updated in 90+ days are flagged as outdated.</p>
            </TooltipContent>
          </Tooltip>
          {isRefetching && <Loader2 className="w-3 h-3 text-muted-foreground animate-spin" />}
        </div>

        <div className="h-5 w-px bg-border" />

        <div className="flex items-center gap-2">
          <FilterPill icon={CheckCircle2} label="Covered" value={health.covered} color="text-success" active={activeFilter === "covered"} onClick={() => onFilterChange("covered")} />
          <FilterPill icon={AlertTriangle} label="Partial" value={health.partial} color="text-warning" active={activeFilter === "partial"} onClick={() => onFilterChange("partial")} />
          <FilterPill icon={XCircle} label="Missing" value={health.missing} color="text-destructive" active={activeFilter === "missing"} onClick={() => onFilterChange("missing")} />
          <FilterPill icon={Clock} label="Outdated" value={health.outdated} color="text-muted-foreground" active={activeFilter === "outdated"} onClick={() => onFilterChange("outdated")} />
        </div>

        <div className="ml-auto flex items-center gap-3">
          <span className="text-xs text-muted-foreground">
            {health.lastAnalyzed ? `Last analyzed ${formatRelative(health.lastAnalyzed)}` : "Not yet analyzed"}
          </span>
          <button
            disabled={reAnalyze.isPending}
            onClick={() => reAnalyze.mutate()}
            className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-subheading bg-muted/50 hover:bg-muted/80 transition-all disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-muted-foreground ${reAnalyze.isPending ? "animate-spin" : ""}`} />
            <span className="text-muted-foreground">{reAnalyze.isPending ? "Analyzing…" : "Re-analyze"}</span>
          </button>
        </div>
      </div>
    </motion.div>
  );
};

function formatRelative(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
}

function FilterPill({ icon: Icon, label, value, color, active, onClick }: { icon: any; label: string; value: number; color: string; active: boolean; onClick: () => void }) {
  return (
    <button
      className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-subheading transition-all ${active ? "bg-primary/10 ring-2 ring-primary/30" : "bg-muted/50 hover:bg-muted/80"}`}
      onClick={onClick}
    >
      <Icon className={`w-3.5 h-3.5 ${color}`} />
      <span className="text-muted-foreground">{label}</span>
      <span className={`font-overline font-mono ${color}`}>{value}</span>
    </button>
  );
}
