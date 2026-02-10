import { useState } from "react";
import { motion } from "framer-motion";
import { stagedEdits as initialEdits, type StagedEdit } from "@/lib/mock-data";
import { GitBranch, Check, X, Send, Bell } from "lucide-react";

export const StagingPanel = () => {
  const [edits, setEdits] = useState<StagedEdit[]>(initialEdits);
  const [pushed, setPushed] = useState(false);

  const pending = edits.filter((e) => e.status === "pending");

  const approve = (id: string) => setEdits((prev) => prev.map((e) => (e.id === id ? { ...e, status: "approved" } : e)));
  const reject = (id: string) => setEdits((prev) => prev.map((e) => (e.id === id ? { ...e, status: "rejected" } : e)));

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.3 }}
      className="rounded-xl border border-border bg-card p-6 shadow-card"
    >
      <div className="flex items-center justify-between mb-5">
        <div className="flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Staging</h2>
          {pending.length > 0 && (
            <span className="rounded-full bg-warning/15 text-warning text-[11px] font-mono font-semibold px-2 py-0.5">
              {pending.length} pending
            </span>
          )}
        </div>
        <div className="flex gap-2">
          <button
            disabled={!edits.some((e) => e.status === "approved") || pushed}
            onClick={() => setPushed(true)}
            className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-30 transition-opacity"
          >
            <Send className="w-3 h-3" />
            {pushed ? "Pushed!" : "Push to Notion"}
          </button>
          <button className="flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-1.5 text-xs font-semibold text-secondary-foreground">
            <Bell className="w-3 h-3" />
            Nudge Reps
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {edits.map((edit) => (
          <motion.div
            key={edit.id}
            layout
            className={`rounded-lg border p-4 transition-colors ${
              edit.status === "approved"
                ? "border-success/30 bg-success/5"
                : edit.status === "rejected"
                ? "border-destructive/30 bg-destructive/5 opacity-50"
                : "border-border bg-muted/30"
            }`}
          >
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-foreground">{edit.section}</span>
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-mono font-semibold ${
                  edit.status === "approved"
                    ? "bg-success/15 text-success"
                    : edit.status === "rejected"
                    ? "bg-destructive/15 text-destructive"
                    : "bg-warning/15 text-warning"
                }`}>
                  {edit.status}
                </span>
              </div>
              {edit.status === "pending" && (
                <div className="flex gap-1">
                  <button onClick={() => approve(edit.id)} className="w-6 h-6 rounded bg-success/15 flex items-center justify-center hover:bg-success/25 transition-colors">
                    <Check className="w-3 h-3 text-success" />
                  </button>
                  <button onClick={() => reject(edit.id)} className="w-6 h-6 rounded bg-destructive/15 flex items-center justify-center hover:bg-destructive/25 transition-colors">
                    <X className="w-3 h-3 text-destructive" />
                  </button>
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">Before</span>
                <div className="mt-1 rounded bg-destructive/5 border border-destructive/10 p-2 text-muted-foreground font-mono leading-relaxed min-h-[40px]">
                  {edit.before || <span className="italic text-muted-foreground/50">Empty — new content</span>}
                </div>
              </div>
              <div>
                <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">After</span>
                <div className="mt-1 rounded bg-success/5 border border-success/10 p-2 text-foreground font-mono leading-relaxed min-h-[40px]">
                  {edit.after}
                </div>
              </div>
            </div>
          </motion.div>
        ))}

        {edits.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm">No staged edits yet. Use the chat to make changes.</div>
        )}
      </div>
    </motion.div>
  );
};
