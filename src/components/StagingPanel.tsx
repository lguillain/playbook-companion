import { useState } from "react";
import { motion } from "framer-motion";
import { useStagedEdits, useApproveEdit, useRejectEdit, useUnapproveEdit, useUnrejectEdit, useUpdateEditText } from "@/hooks/use-staged-edits";
import { usePublish, useNotify } from "@/hooks/use-publish";
import { useConnections } from "@/hooks/use-connections";
import { GitBranch, Check, X, Send, Bell, MessageSquare, Edit3, Loader2, Eye, EyeOff, Pencil, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { DiffView } from "./DiffView";

const providerLabels: Record<string, string> = {
  confluence: "Confluence",
  notion: "Notion",
};

export const StagingPanel = () => {
  const { data: edits, isLoading } = useStagedEdits();
  const { data: connections } = useConnections();
  const approveEdit = useApproveEdit();
  const rejectEdit = useRejectEdit();
  const unapproveEdit = useUnapproveEdit();
  const unrejectEdit = useUnrejectEdit();
  const updateEditText = useUpdateEditText();
  const publish = usePublish();
  const notify = useNotify();
  const [showRejected, setShowRejected] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");

  // Determine which provider to publish to based on connected integrations
  const connectedProvider = connections?.find((c) => c.provider === "confluence" || c.provider === "notion")?.provider ?? null;
  const publishLabel = connectedProvider ? providerLabels[connectedProvider] ?? connectedProvider : null;

  if (isLoading || !edits) {
    return (
      <div className="rounded-xl border border-border bg-card p-6 shadow-card flex items-center justify-center min-h-[300px]">
        <Loader2 className="w-6 h-6 text-primary animate-spin" />
      </div>
    );
  }

  const pending = edits.filter((e) => e.status === "pending");
  const rejected = edits.filter((e) => e.status === "rejected");
  const hasApproved = edits.some((e) => e.status === "approved");
  const visibleEdits = showRejected ? edits : edits.filter((e) => e.status !== "rejected");

  const handlePublish = async () => {
    if (!connectedProvider) return;
    try {
      const result = await publish.mutateAsync(connectedProvider);
      toast.success(`Published ${result.published} section(s) to ${publishLabel}`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const handleNudge = async () => {
    try {
      const result = await notify.mutateAsync({
        type: "slack",
        message: "Your playbook has been updated! Check out the latest changes.",
      });
      toast.success(`Notified ${result.notified} team member(s)`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

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
          <h2 className="text-lg font-semibold text-foreground">Review & Publish</h2>
          {pending.length > 0 && (
            <span className="rounded-full bg-warning/15 text-warning text-[11px] font-mono font-semibold px-2 py-0.5">
              {pending.length} pending
            </span>
          )}
          {rejected.length > 0 && (
            <button
              onClick={() => setShowRejected((v) => !v)}
              className="flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              {showRejected ? <EyeOff className="w-3 h-3" /> : <Eye className="w-3 h-3" />}
              {rejected.length} rejected
            </button>
          )}
        </div>
        <div className="flex gap-2">
          {publishLabel && (
            <button
              disabled={!hasApproved || publish.isPending}
              onClick={handlePublish}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-30 transition-opacity"
            >
              {publish.isPending ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Send className="w-3 h-3" />
              )}
              {publish.isSuccess ? "Pushed!" : `Push to ${publishLabel}`}
            </button>
          )}
          <button
            onClick={handleNudge}
            disabled={notify.isPending}
            className="flex items-center gap-1.5 rounded-lg bg-secondary px-3 py-1.5 text-xs font-semibold text-secondary-foreground disabled:opacity-30"
          >
            {notify.isPending ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Bell className="w-3 h-3" />
            )}
            Nudge Reps
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {visibleEdits.map((edit) => (
          <motion.div
            key={edit.id}
            layout="position"
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
                {edit.source && (
                  <div className={`flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium ${
                    edit.source === "chat"
                      ? "bg-primary/10 text-primary"
                      : "bg-secondary/50 text-secondary-foreground"
                  }`}>
                    {edit.source === "chat" ? (
                      <>
                        <MessageSquare className="w-2.5 h-2.5" />
                        <span>AI Chat</span>
                      </>
                    ) : (
                      <>
                        <Edit3 className="w-2.5 h-2.5" />
                        <span>Manual</span>
                      </>
                    )}
                  </div>
                )}
              </div>
              {edit.status === "pending" && (
                <div className="flex gap-1">
                  <button
                    onClick={() => {
                      setEditingId(edit.id);
                      setEditDraft(edit.after);
                    }}
                    className="w-6 h-6 rounded bg-muted flex items-center justify-center hover:bg-muted/80 transition-colors"
                    title="Edit suggestion"
                  >
                    <Pencil className="w-3 h-3 text-muted-foreground" />
                  </button>
                  <button
                    onClick={() => approveEdit.mutate(edit.id)}
                    disabled={approveEdit.isPending}
                    className="w-6 h-6 rounded bg-success/15 flex items-center justify-center hover:bg-success/25 transition-colors"
                  >
                    <Check className="w-3 h-3 text-success" />
                  </button>
                  <button
                    onClick={() => rejectEdit.mutate(edit.id)}
                    disabled={rejectEdit.isPending}
                    className="w-6 h-6 rounded bg-destructive/15 flex items-center justify-center hover:bg-destructive/25 transition-colors"
                  >
                    <X className="w-3 h-3 text-destructive" />
                  </button>
                </div>
              )}
              {edit.status === "approved" && (
                <button
                  onClick={() => unapproveEdit.mutate(edit.id)}
                  disabled={unapproveEdit.isPending}
                  className="flex items-center gap-1 rounded bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  Undo
                </button>
              )}
              {edit.status === "rejected" && (
                <button
                  onClick={() => unrejectEdit.mutate(edit.id)}
                  disabled={unrejectEdit.isPending}
                  className="flex items-center gap-1 rounded bg-muted px-2 py-1 text-[10px] font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  Undo
                </button>
              )}
            </div>

            {editingId === edit.id ? (
              <div className="space-y-2">
                {edit.before && (
                  <div className="rounded border border-border bg-muted/50 p-3">
                    <div className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">Before (read-only)</div>
                    <pre className="text-xs text-muted-foreground whitespace-pre-wrap">{edit.before}</pre>
                  </div>
                )}
                <textarea
                  value={editDraft}
                  onChange={(e) => setEditDraft(e.target.value)}
                  rows={Math.max(3, editDraft.split("\n").length)}
                  className="w-full rounded border border-border bg-background p-3 text-xs text-foreground font-mono resize-y focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setEditingId(null)}
                    className="rounded px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    disabled={!editDraft.trim() || editDraft === edit.after || updateEditText.isPending}
                    onClick={() => {
                      updateEditText.mutate(
                        { editId: edit.id, afterText: editDraft },
                        { onSuccess: () => setEditingId(null) },
                      );
                    }}
                    className="rounded bg-primary px-3 py-1.5 text-xs font-semibold text-primary-foreground disabled:opacity-30 transition-opacity"
                  >
                    {updateEditText.isPending ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            ) : (
              <DiffView before={edit.before} after={edit.after} fullSize />
            )}
          </motion.div>
        ))}

        {visibleEdits.length === 0 && (
          <div className="text-center py-8 text-muted-foreground text-sm">
            {edits.length === 0
              ? "No staged edits yet. Use the chat to make changes."
              : "All changes have been rejected. Click \"rejected\" above to review them."}
          </div>
        )}
      </div>
    </motion.div>
  );
};
