import { useMemo, useState } from "react";
import { Markdown } from "./Markdown";
import { TableDiffView } from "./TableDiffView";
import {
  parsePipeTable,
  fixGfmTables,
  computeBlockDiff,
  type BlockDiff,
} from "@/lib/compute-diff";

type DiffViewProps = {
  before?: string | null;
  after: string;
  /** Controls padding / font sizing for compact (chat) vs full-size (modal/panel) */
  fullSize?: boolean;
};

export const DiffView = ({ before, after, fullSize = false }: DiffViewProps) => {
  const maxH = fullSize ? "max-h-[60vh] overflow-y-auto" : "max-h-[200px] overflow-y-auto";

  // New content — no before
  if (!before) {
    return (
      <div className={`text-sm leading-relaxed diff-added-text ${maxH}`}>
        <Markdown>{fixGfmTables(after)}</Markdown>
      </div>
    );
  }

  // No actual change
  if (before === after) {
    return (
      <div className={`text-sm leading-relaxed text-muted-foreground ${maxH}`}>
        <Markdown>{fixGfmTables(after)}</Markdown>
      </div>
    );
  }

  // Try cell-level table diff when both sides parse as pipe tables
  const beforeTable = parsePipeTable(before);
  const afterTable = parsePipeTable(after);

  if (beforeTable && afterTable) {
    return (
      <div className={maxH}>
        <TableDiffView before={beforeTable} after={afterTable} />
      </div>
    );
  }

  return <InlineDiffView before={before} after={after} maxH={maxH} />;
};

// ── Inline suggestion-style diff view ────────────────────────────────

const InlineDiffView = ({ before, after, maxH }: { before: string; after: string; maxH: string }) => {
  const diffs = useMemo(() => computeBlockDiff(before, after), [before, after]);

  return (
    <div className={`text-sm leading-relaxed space-y-2 ${maxH}`}>
      {diffs.map((d, i) => (
        <DiffEntry key={i} entry={d} />
      ))}
    </div>
  );
};

// ── Per-entry renderer ───────────────────────────────────────────────

const DiffEntry = ({ entry }: { entry: BlockDiff }) => {
  switch (entry.type) {
    case "unchanged":
      return <UnchangedGroup blocks={entry.blocks} />;
    case "added":
      return (
        <div className="diff-added-text">
          <Markdown>{fixGfmTables(entry.block)}</Markdown>
        </div>
      );
    case "removed":
      return (
        <div className="diff-removed-text">
          <Markdown>{fixGfmTables(entry.block)}</Markdown>
        </div>
      );
    case "modified":
      return (
        <div>
          <div className="diff-removed-text">
            <Markdown>{fixGfmTables(entry.before)}</Markdown>
          </div>
          <div className="diff-added-text">
            <Markdown>{fixGfmTables(entry.after)}</Markdown>
          </div>
        </div>
      );
  }
};

// ── Unchanged group with collapsing ──────────────────────────────────

const COLLAPSE_BLOCK_THRESHOLD = 3;
const COLLAPSE_LINE_THRESHOLD = 10;

const UnchangedGroup = ({ blocks }: { blocks: string[] }) => {
  const [expanded, setExpanded] = useState(false);

  const totalLines = blocks.reduce((sum, b) => sum + b.split("\n").length, 0);
  const shouldCollapse =
    blocks.length > COLLAPSE_BLOCK_THRESHOLD || totalLines > COLLAPSE_LINE_THRESHOLD;

  if (!shouldCollapse || expanded) {
    return (
      <div className="text-muted-foreground">
        {blocks.map((b, i) => (
          <Markdown key={i}>{fixGfmTables(b)}</Markdown>
        ))}
        {expanded && (
          <button
            onClick={() => setExpanded(false)}
            className="text-[10px] text-muted-foreground/50 hover:text-muted-foreground transition-colors"
          >
            Collapse
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="text-muted-foreground">
      <Markdown>{fixGfmTables(blocks[0])}</Markdown>
      <button
        onClick={() => setExpanded(true)}
        className="text-[10px] text-muted-foreground/40 hover:text-muted-foreground transition-colors py-0.5"
      >
        &hellip;
      </button>
      <Markdown>{fixGfmTables(blocks[blocks.length - 1])}</Markdown>
    </div>
  );
};
