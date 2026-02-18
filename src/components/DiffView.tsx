import { useMemo } from "react";
import { DiffMarkdown } from "./DiffMarkdown";
import {
  containsTable,
  computeInlineDiff,
  computeHighlightedBefore,
  computeHighlightedAfter,
} from "@/lib/compute-diff";

type DiffViewProps = {
  before?: string | null;
  after: string;
  /** Controls padding / font sizing for compact (chat) vs full-size (modal/panel) */
  fullSize?: boolean;
};

export const DiffView = ({ before, after, fullSize = false }: DiffViewProps) => {
  const textClass = fullSize ? "text-sm" : "text-[11px]";
  const labelClass = fullSize ? "text-xs" : "text-[9px]";
  const padClass = fullSize ? "p-3" : "p-2";
  const maxH = fullSize ? "max-h-[60vh] overflow-y-auto" : "max-h-[200px] overflow-y-auto";

  // New content — no before
  if (!before) {
    return (
      <div className={textClass}>
        <span className={`${labelClass} font-semibold text-success uppercase tracking-wider`}>
          New content
        </span>
        <div className={`mt-1 rounded bg-success/5 border border-success/10 ${padClass} text-foreground leading-relaxed ${maxH}`}>
          <DiffMarkdown>{after}</DiffMarkdown>
        </div>
      </div>
    );
  }

  // Removed content — no after (shouldn't normally happen, but defensive)
  if (!after) {
    return (
      <div className={textClass}>
        <span className={`${labelClass} font-semibold text-destructive uppercase tracking-wider`}>
          Removed content
        </span>
        <div className={`mt-1 rounded bg-destructive/5 border border-destructive/10 ${padClass} text-muted-foreground leading-relaxed line-through ${maxH}`}>
          <DiffMarkdown>{before}</DiffMarkdown>
        </div>
      </div>
    );
  }

  // No actual change
  if (before === after) {
    return (
      <div className={textClass}>
        <span className={`${labelClass} font-semibold text-muted-foreground uppercase tracking-wider`}>
          No changes
        </span>
        <div className={`mt-1 rounded bg-muted/30 border border-border ${padClass} text-foreground leading-relaxed ${maxH}`}>
          <DiffMarkdown>{after}</DiffMarkdown>
        </div>
      </div>
    );
  }

  const hasTable = containsTable(before) || containsTable(after);

  if (hasTable) {
    return <UnifiedDiff before={before} after={after} labelClass={labelClass} padClass={padClass} maxH={maxH} />;
  }

  return <SideBySideDiff before={before} after={after} labelClass={labelClass} padClass={padClass} maxH={maxH} />;
};

// ── Unified diff (for tables) ───────────────────────────────────────

type InnerDiffProps = {
  before: string;
  after: string;
  labelClass: string;
  padClass: string;
  maxH: string;
};

const UnifiedDiff = ({ before, after, labelClass, padClass, maxH }: InnerDiffProps) => {
  const merged = useMemo(() => computeInlineDiff(before, after), [before, after]);

  return (
    <div>
      <div className="flex items-center gap-3 mb-1">
        <span className={`${labelClass} font-semibold text-muted-foreground uppercase tracking-wider`}>
          Changes
        </span>
        <div className="flex items-center gap-2">
          <span className={`inline-flex items-center gap-1 ${labelClass} text-destructive`}>
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-destructive/20 border border-destructive/30" />
            Removed
          </span>
          <span className={`inline-flex items-center gap-1 ${labelClass} text-success`}>
            <span className="inline-block w-2.5 h-2.5 rounded-sm bg-success/20 border border-success/30" />
            Added
          </span>
        </div>
      </div>
      <div className={`rounded border border-border bg-muted/10 ${padClass} leading-relaxed ${maxH}`}>
        <DiffMarkdown>{merged}</DiffMarkdown>
      </div>
    </div>
  );
};

// ── Side-by-side diff (for non-table content) ──────────────────────

const SideBySideDiff = ({ before, after, labelClass, padClass, maxH }: InnerDiffProps) => {
  const highlightedBefore = useMemo(() => computeHighlightedBefore(before, after), [before, after]);
  const highlightedAfter = useMemo(() => computeHighlightedAfter(before, after), [before, after]);

  return (
    <div className="grid grid-cols-2 gap-3">
      <div>
        <span className={`${labelClass} font-semibold text-muted-foreground uppercase tracking-wider`}>
          Before
        </span>
        <div className={`mt-1 rounded bg-destructive/5 border border-destructive/10 ${padClass} text-muted-foreground leading-relaxed min-h-[40px] ${maxH}`}>
          <DiffMarkdown>{highlightedBefore}</DiffMarkdown>
        </div>
      </div>
      <div>
        <span className={`${labelClass} font-semibold text-muted-foreground uppercase tracking-wider`}>
          After
        </span>
        <div className={`mt-1 rounded bg-success/5 border border-success/10 ${padClass} text-foreground leading-relaxed min-h-[40px] ${maxH}`}>
          <DiffMarkdown>{highlightedAfter}</DiffMarkdown>
        </div>
      </div>
    </div>
  );
};
