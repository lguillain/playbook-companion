import { useMemo } from "react";
import { diffWords } from "diff";
import type { ParsedTable } from "@/lib/compute-diff";

type TableDiffViewProps = {
  before: ParsedTable;
  after: ParsedTable;
};

type CellDiff = {
  text: string;
  type: "unchanged" | "added" | "removed";
}[];

function diffCells(a: string, b: string): CellDiff {
  if (a === b) return [{ text: a, type: "unchanged" }];
  return diffWords(a, b).map((change) => ({
    text: change.value,
    type: change.added ? "added" : change.removed ? "removed" : "unchanged",
  }));
}

function DiffCellContent({ segments }: { segments: CellDiff }) {
  return (
    <>
      {segments.map((seg, i) => (
        <span
          key={i}
          className={
            seg.type === "added"
              ? "bg-success/15 rounded-sm"
              : seg.type === "removed"
                ? "bg-destructive/15 line-through rounded-sm"
                : ""
          }
        >
          {seg.text}
        </span>
      ))}
    </>
  );
}

export const TableDiffView = ({ before, after }: TableDiffViewProps) => {
  const maxCols = Math.max(before.headers.length, after.headers.length);
  const maxRows = Math.max(before.rows.length, after.rows.length);

  const headerDiffs = useMemo(() => {
    const diffs: CellDiff[] = [];
    for (let c = 0; c < maxCols; c++) {
      const bh = before.headers[c] ?? "";
      const ah = after.headers[c] ?? "";
      diffs.push(diffCells(bh, ah));
    }
    return diffs;
  }, [before.headers, after.headers, maxCols]);

  const rowDiffs = useMemo(() => {
    const rows: { cells: CellDiff[]; rowType: "changed" | "added" | "removed" | "unchanged" }[] = [];
    for (let r = 0; r < maxRows; r++) {
      const bRow = before.rows[r];
      const aRow = after.rows[r];

      if (!bRow) {
        // Added row (only in after)
        const cells = (aRow ?? []).map((cell) => [{ text: cell, type: "added" as const }]);
        while (cells.length < maxCols) cells.push([{ text: "", type: "unchanged" as const }]);
        rows.push({ cells, rowType: "added" });
      } else if (!aRow) {
        // Removed row (only in before)
        const cells = bRow.map((cell) => [{ text: cell, type: "removed" as const }]);
        while (cells.length < maxCols) cells.push([{ text: "", type: "unchanged" as const }]);
        rows.push({ cells, rowType: "removed" });
      } else {
        // Both exist — diff cell by cell
        const cells: CellDiff[] = [];
        let hasChange = false;
        for (let c = 0; c < maxCols; c++) {
          const bc = bRow[c] ?? "";
          const ac = aRow[c] ?? "";
          const d = diffCells(bc, ac);
          if (bc !== ac) hasChange = true;
          cells.push(d);
        }
        rows.push({ cells, rowType: hasChange ? "changed" : "unchanged" });
      }
    }
    return rows;
  }, [before.rows, after.rows, maxRows, maxCols]);

  return (
    <div className="overflow-x-auto rounded-lg border border-border">
      <table className="text-xs border-collapse w-full">
        <thead className="bg-muted/50">
          <tr className="border-b border-border/50">
            {headerDiffs.map((hd, i) => (
              <th
                key={i}
                className="text-left px-3 py-2 font-semibold text-foreground border-b border-border"
              >
                <DiffCellContent segments={hd} />
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rowDiffs.map((row, r) => (
            <tr
              key={r}
              className={`border-b border-border/50 last:border-b-0 ${
                row.rowType === "added"
                  ? "bg-success/5"
                  : row.rowType === "removed"
                    ? "bg-destructive/5"
                    : ""
              }`}
            >
              {row.cells.map((cellSegs, c) => (
                <td key={c} className="px-3 py-2 text-secondary-foreground">
                  <DiffCellContent segments={cellSegs} />
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};
