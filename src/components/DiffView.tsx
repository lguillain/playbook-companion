import { useMemo } from "react";
import { Markdown, DiffMarkdown } from "./Markdown";
import { TableDiffView } from "./TableDiffView";
import {
  containsTable,
  parsePipeTable,
  fixGfmTables,
  computeDiffSegments,
} from "@/lib/compute-diff";

type DiffViewProps = {
  before?: string | null;
  after: string;
  /** Controls padding / font sizing for compact (chat) vs full-size (modal/panel) */
  fullSize?: boolean;
};

export const DiffView = ({ before, after, fullSize = false }: DiffViewProps) => {
  const labelClass = fullSize ? "text-[10px]" : "text-[9px]";
  const padClass = fullSize ? "p-2" : "p-1.5";
  const maxH = fullSize ? "max-h-[60vh] overflow-y-auto" : "max-h-[200px] overflow-y-auto";

  // New content — no before
  if (!before) {
    return (
      <div>
        <span className={`${labelClass} font-overline text-muted-foreground uppercase tracking-wider`}>
          New content
        </span>
        <div className={`mt-1 rounded bg-success/5 border border-success/10 ${padClass} text-foreground leading-relaxed min-h-[40px] ${maxH}`}>
          <Markdown>{fixGfmTables(after)}</Markdown>
        </div>
      </div>
    );
  }

  // No actual change
  if (before === after) {
    return (
      <div>
        <span className={`${labelClass} font-overline text-muted-foreground uppercase tracking-wider`}>
          No changes
        </span>
        <div className={`mt-1 rounded bg-muted/30 border border-border ${padClass} text-foreground leading-relaxed min-h-[40px] ${maxH}`}>
          <Markdown>{fixGfmTables(after)}</Markdown>
        </div>
      </div>
    );
  }

  const hasTable = containsTable(before) || containsTable(after);

  if (hasTable) {
    return <TableDiff before={before} after={after} labelClass={labelClass} padClass={padClass} maxH={maxH} />;
  }

  return <TextDiff before={before} after={after} labelClass={labelClass} padClass={padClass} maxH={maxH} />;
};

// ── Table diff (cell-level structured diff) ──────────────────────────

type InnerDiffProps = {
  before: string;
  after: string;
  labelClass: string;
  padClass: string;
  maxH: string;
};

const TableDiff = ({ before, after, labelClass, padClass, maxH }: InnerDiffProps) => {
  const beforeTable = useMemo(() => parsePipeTable(before), [before]);
  const afterTable = useMemo(() => parsePipeTable(after), [after]);

  // Both sides parsed as tables → cell-level diff
  if (beforeTable && afterTable) {
    return (
      <div>
        <div className="flex items-center gap-2 mb-1">
          <span className={`${labelClass} font-overline text-muted-foreground uppercase tracking-wider`}>
            Changes
          </span>
          <span className={`${labelClass} text-muted-foreground/60`}>
            <span className="text-destructive">red</span> = removed, <span className="text-success">green</span> = added
          </span>
        </div>
        <div className={`${maxH}`}>
          <TableDiffView before={beforeTable} after={afterTable} />
        </div>
      </div>
    );
  }

  // Fallback: render fixed GFM through Markdown in stacked layout
  return (
    <div className="space-y-2">
      <div>
        <span className={`${labelClass} font-overline text-muted-foreground uppercase tracking-wider`}>
          Current version
        </span>
        <div className={`mt-1 rounded bg-destructive/5 border border-destructive/10 ${padClass} text-muted-foreground leading-relaxed min-h-[40px] ${maxH}`}>
          <Markdown>{fixGfmTables(before)}</Markdown>
        </div>
      </div>
      <div>
        <span className={`${labelClass} font-overline text-muted-foreground uppercase tracking-wider`}>
          Proposed version
        </span>
        <div className={`mt-1 rounded bg-success/5 border border-success/10 ${padClass} text-foreground leading-relaxed min-h-[40px] ${maxH}`}>
          <Markdown>{fixGfmTables(after)}</Markdown>
        </div>
      </div>
    </div>
  );
};

// ── Inline word-level diff (for non-table content) ──────────────────

const TextDiff = ({ before, after, labelClass, maxH }: InnerDiffProps) => {
  const diffMarkdown = useMemo(() => {
    const segments = computeDiffSegments(before, after);
    return segments
      .map((seg) => {
        if (seg.type === "added") return `<ins>${seg.text}</ins>`;
        if (seg.type === "removed") return `<del>${seg.text}</del>`;
        return seg.text;
      })
      .join("");
  }, [before, after]);

  return (
    <div>
      <div className="flex items-center gap-2 mb-1">
        <span className={`${labelClass} font-overline text-muted-foreground uppercase tracking-wider`}>
          Changes
        </span>
        <span className={`${labelClass} text-muted-foreground/60`}>
          <span className="text-destructive">red</span> = removed, <span className="text-success">green</span> = added
        </span>
      </div>
      <div className={`overflow-x-auto rounded-lg border border-border p-3 ${maxH}`}>
        <DiffMarkdown>{fixGfmTables(diffMarkdown)}</DiffMarkdown>
      </div>
    </div>
  );
};
