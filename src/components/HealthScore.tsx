import { motion } from "framer-motion";
import { getHealthScore } from "@/lib/mock-data";
import { TrendingUp, AlertTriangle, Clock, CheckCircle2 } from "lucide-react";

export const HealthScore = () => {
  const health = getHealthScore();
  const circumference = 2 * Math.PI * 54;
  const offset = circumference - (health.score / 100) * circumference;
  const healthColor = health.score >= 70 ? "text-success" : health.score >= 40 ? "text-warning" : "text-destructive";
  const gradientClass = health.score >= 70 ? "health-gradient-good" : health.score >= 40 ? "health-gradient-warn" : "health-gradient-bad";

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-border bg-card p-6 shadow-card"
    >
      <div className="flex items-start justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Playbook Health</h2>
          <p className="text-sm text-muted-foreground mt-1">Based on skills framework coverage</p>
        </div>
        <div className={`rounded-lg px-2.5 py-1 text-xs font-mono font-semibold ${gradientClass} text-primary-foreground`}>
          LIVE
        </div>
      </div>

      <div className="flex items-center gap-8">
        <div className="relative w-32 h-32 flex-shrink-0">
          <svg className="w-32 h-32 -rotate-90" viewBox="0 0 120 120">
            <circle cx="60" cy="60" r="54" fill="none" stroke="hsl(var(--muted))" strokeWidth="8" />
            <motion.circle
              cx="60" cy="60" r="54" fill="none"
              stroke="hsl(var(--primary))"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset: offset }}
              transition={{ duration: 1.5, ease: "easeOut" }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <motion.span
              className={`text-3xl font-bold font-mono ${healthColor}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.5 }}
            >
              {health.score}
            </motion.span>
            <span className="text-xs text-muted-foreground">/ 100</span>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-3 flex-1">
          <StatCard icon={CheckCircle2} label="Covered" value={health.covered} total={health.total} color="text-success" />
          <StatCard icon={TrendingUp} label="Partial" value={health.partial} total={health.total} color="text-primary" />
          <StatCard icon={AlertTriangle} label="Missing" value={health.missing} total={health.total} color="text-warning" />
          <StatCard icon={Clock} label="Outdated" value={health.outdated} total={health.total} color="text-muted-foreground" />
        </div>
      </div>
    </motion.div>
  );
};

function StatCard({ icon: Icon, label, value, total, color }: { icon: any; label: string; value: number; total: number; color: string }) {
  return (
    <div className="rounded-lg bg-muted/50 p-3">
      <div className="flex items-center gap-2 mb-1">
        <Icon className={`w-3.5 h-3.5 ${color}`} />
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <div className="flex items-baseline gap-1">
        <span className={`text-xl font-bold font-mono ${color}`}>{value}</span>
        <span className="text-xs text-muted-foreground">/ {total}</span>
      </div>
    </div>
  );
}
