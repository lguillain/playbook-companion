import { useState } from "react";
import { motion } from "framer-motion";
import { useStagedEdits, useApproveEdit, useRejectEdit, useUnapproveEdit, useUnrejectEdit, useUpdateEditText } from "@/hooks/use-staged-edits";
import { usePublish, useNotify } from "@/hooks/use-publish";
import { useConnections } from "@/hooks/use-connections";
import { ClipboardList, Check, X, Send, Bell, Sparkles, Edit3, Loader2, Eye, EyeOff, Pencil, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { DiffView } from "./DiffView";
import { MarkdownEditor } from "./MarkdownEditor";
import { Markdown } from "./Markdown";
import { fixGfmTables, containsTable } from "@/lib/compute-diff";

const providerLabels: Record<string, string> = {
  confluence: "Confluence",
  notion: "Notion",
};

/** Inline tracked-changes view: renders text with green highlights for additions and red strikethrough for removals. */
const InlineChangesView = ({ before, after }: { before?: string | null; after: string }) => {
  // New content — no before, just show rendered markdown
  if (!before) {
    return (
      <div className="rounded-lg border border-success/20 bg-success/5 p-4 max-h-[60vh] overflow-y-auto">
        <div className="text-[11px] font-semibold text-success uppercase tracking-wider mb-2">New content</div>
        <Markdown>{fixGfmTables(after)}</Markdown>
      </div>
    );
  }

  // No change
  if (before === after) {
    return (
      <div className="rounded-lg border border-border bg-background p-4 max-h-[60vh] overflow-y-auto">
        <Markdown>{fixGfmTables(after)}</Markdown>
      </div>
    );
  }

  // Render both versions as markdown
  return <DiffView before={before} after={after} fullSize />;
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
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <ClipboardList className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-semibold text-foreground">Review & Publish</h2>
          {pending.length > 0 && (
            <span className="rounded-full bg-warning/15 text-warning text-xs font-semibold px-2.5 py-0.5">
              {pending.length} to review
            </span>
          )}
          {rejected.length > 0 && (
            <button
              onClick={() => setShowRejected((v) => !v)}
              className="flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              {showRejected ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              {rejected.length} dismissed
            </button>
          )}
        </div>
        <div className="flex gap-2">
          {publishLabel && (
            <button
              disabled={!hasApproved || publish.isPending}
              onClick={handlePublish}
              className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-30 transition-opacity"
            >
              {publish.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Send className="w-3.5 h-3.5" />
              )}
              {publish.isSuccess ? "Published!" : `Publish to ${publishLabel}`}
            </button>
          )}
          <button
            onClick={handleNudge}
            disabled={notify.isPending}
            className="flex items-center gap-1.5 rounded-lg bg-secondary px-4 py-2 text-sm font-semibold text-secondary-foreground disabled:opacity-30"
          >
            {notify.isPending ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Bell className="w-3.5 h-3.5" />
            )}
            Notify team
          </button>
        </div>
      </div>

      <div className="space-y-4">
        {visibleEdits.map((edit) => (
          <motion.div
            key={edit.id}
            layout="position"
            className={`rounded-xl border p-5 transition-colors ${
              edit.status === "approved"
                ? "border-success/30 bg-card"
                : edit.status === "rejected"
                ? "border-destructive/30 bg-destructive/5 opacity-50"
                : "border-border bg-muted/30"
            }`}
          >
            {/* Header: section name + status */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2.5">
                <span className="text-sm font-semibold text-foreground">{edit.section}</span>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                  edit.status === "approved"
                    ? "bg-success/15 text-success"
                    : edit.status === "rejected"
                    ? "bg-destructive/15 text-destructive"
                    : "bg-warning/15 text-warning"
                }`}>
                  {edit.status === "approved"
                    ? "Accepted"
                    : edit.status === "rejected"
                    ? "Dismissed"
                    : "Needs review"}
                </span>
                {edit.source && (
                  <div className={`flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${
                    edit.source === "chat"
                      ? "bg-primary/10 text-primary"
                      : "bg-secondary/50 text-secondary-foreground"
                  }`}>
                    {edit.source === "chat" ? (
                      <>
                        <Sparkles className="w-3 h-3" />
                        <span>AI suggestion</span>
                      </>
                    ) : (
                      <>
                        <Edit3 className="w-3 h-3" />
                        <span>Your edit</span>
                      </>
                    )}
                  </div>
                )}
              </div>

              {/* Undo button for accepted/dismissed */}
              {edit.status === "approved" && (
                <button
                  onClick={() => unapproveEdit.mutate(edit.id)}
                  disabled={unapproveEdit.isPending}
                  className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  Undo
                </button>
              )}
              {edit.status === "rejected" && (
                <button
                  onClick={() => unrejectEdit.mutate(edit.id)}
                  disabled={unrejectEdit.isPending}
                  className="flex items-center gap-1.5 rounded-lg bg-muted px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors"
                >
                  <RotateCcw className="w-3 h-3" />
                  Undo
                </button>
              )}
            </div>

            {/* Content area */}
            {editingId === edit.id ? (
              <div className="space-y-3">
                {edit.before && (
                  <div className="rounded-lg border border-border bg-muted/50 p-3">
                    <div className="text-xs font-semibold text-muted-foreground mb-1.5">Current version (read-only)</div>
                    <Markdown>{fixGfmTables(edit.before)}</Markdown>
                  </div>
                )}
                <MarkdownEditor markdown={editDraft} onChange={setEditDraft} />
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => setEditingId(null)}
                    className="rounded-lg px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
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
                    className="rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground disabled:opacity-30 transition-opacity"
                  >
                    {updateEditText.isPending ? "Saving..." : "Save"}
                  </button>
                </div>
              </div>
            ) : (
              <div>
                <InlineChangesView before={edit.before} after={edit.after} />

                {/* Action buttons */}
                <div className="flex items-center justify-end mt-3">
                  {edit.status === "pending" && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          setEditingId(edit.id);
                          setEditDraft(edit.after);
                        }}
                        className="flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
                      >
                        <Pencil className="w-3 h-3" />
                        Edit
                      </button>
                      <button
                        onClick={() => rejectEdit.mutate(edit.id)}
                        disabled={rejectEdit.isPending}
                        className="flex items-center gap-1.5 rounded-lg border border-destructive/30 px-3 py-1.5 text-xs font-semibold text-destructive hover:bg-destructive/10 transition-colors"
                      >
                        <X className="w-3.5 h-3.5" />
                        Dismiss
                      </button>
                      <button
                        onClick={() => approveEdit.mutate(edit.id)}
                        disabled={approveEdit.isPending}
                        className="flex items-center gap-1.5 rounded-lg bg-success/15 px-4 py-1.5 text-xs font-semibold text-success hover:bg-success/25 transition-colors"
                      >
                        <Check className="w-3.5 h-3.5" />
                        Accept
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </motion.div>
        ))}

        {visibleEdits.length === 0 && (
          <div className="text-center py-10 text-muted-foreground text-sm">
            {edits.length === 0
              ? "No suggested changes yet. Use the chat to get started."
              : "All suggestions have been dismissed. Click \"dismissed\" above to review them."}
          </div>
        )}
      </div>
    </motion.div>
  );
};
