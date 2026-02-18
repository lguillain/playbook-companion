import { diffWords } from "diff";

export type DiffSegment = {
  text: string;
  type: "unchanged" | "added" | "removed";
};

export type ParsedTable = {
  headers: string[];
  rows: string[][];
};

/** Detect pipe-delimited table content (2+ consecutive lines starting with |). */
export function containsTable(md: string): boolean {
  const lines = md.split("\n");
  let consecutive = 0;
  for (const line of lines) {
    if (line.trimStart().startsWith("|")) {
      consecutive++;
      if (consecutive >= 2) return true;
    } else {
      consecutive = 0;
    }
  }
  return false;
}

/**
 * Add GFM separator rows to pipe-delimited blocks that are missing them.
 * e.g. if the second line of a pipe block is NOT `| --- | --- |`, insert one.
 */
export function fixGfmTables(md: string): string {
  const lines = md.split("\n");
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    result.push(line);

    // If this line starts a pipe block and the next line is also a pipe line
    // but is NOT a separator row, inject one
    if (
      line.trimStart().startsWith("|") &&
      i + 1 < lines.length &&
      lines[i + 1].trimStart().startsWith("|") &&
      !isSeparatorRow(lines[i + 1])
    ) {
      // Check the line before: if it's not a pipe line (or we're at the start),
      // this is the header row — inject separator
      const prevIsPipe = i > 0 && lines[i - 1].trimStart().startsWith("|");
      if (!prevIsPipe) {
        const colCount = splitPipeRow(line).length;
        const sep = "| " + Array(colCount).fill("---").join(" | ") + " |";
        result.push(sep);
      }
    }

    i++;
  }

  return result.join("\n");
}

/** Check if a line is a GFM table separator row like `| --- | --- |` */
function isSeparatorRow(line: string): boolean {
  const trimmed = line.trim();
  // Must start and end with |, and only contain |, -, :, and spaces
  return /^\|[\s|:\-]+\|$/.test(trimmed) && trimmed.includes("---");
}

/** Split a pipe-delimited row into trimmed cell values. */
function splitPipeRow(line: string): string[] {
  const trimmed = line.trim();
  // Remove leading/trailing pipe and split
  const inner = trimmed.startsWith("|") ? trimmed.slice(1) : trimmed;
  const end = inner.endsWith("|") ? inner.slice(0, -1) : inner;
  return end.split("|").map((c) => c.trim());
}

/**
 * Parse pipe-delimited markdown into a structured table.
 * Returns null if the content isn't a recognizable pipe table.
 */
export function parsePipeTable(md: string): ParsedTable | null {
  const lines = md
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length < 1) return null;

  // All non-empty lines should start with |
  const pipeLines = lines.filter((l) => l.startsWith("|"));
  if (pipeLines.length < 1) return null;

  // Filter out separator rows
  const dataLines = pipeLines.filter((l) => !isSeparatorRow(l));
  if (dataLines.length < 1) return null;

  const headers = splitPipeRow(dataLines[0]);
  const rows = dataLines.slice(1).map((l) => splitPipeRow(l));

  return { headers, rows };
}

/** Compute word-level diff segments. */
export function computeDiffSegments(
  before: string,
  after: string,
): DiffSegment[] {
  return diffWords(before, after).map((change) => ({
    text: change.value,
    type: change.added ? "added" : change.removed ? "removed" : "unchanged",
  }));
}
