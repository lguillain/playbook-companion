import { diffWords, diffArrays, diffLines } from "diff";

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

  // Only consider lines that look like real pipe-table rows (start with | and have 2+ cells)
  const pipeLines = lines.filter(
    (l) => l.startsWith("|") && splitPipeRow(l).length >= 2,
  );
  if (pipeLines.length < 1) return null;

  // Avoid false positives: at least half the non-empty lines should be pipe rows
  if (pipeLines.length < lines.length / 2) return null;

  // Filter out separator rows
  const dataLines = pipeLines.filter((l) => !isSeparatorRow(l));
  if (dataLines.length < 1) return null;

  const headers = splitPipeRow(dataLines[0]);
  const rows = dataLines.slice(1).map((l) => splitPipeRow(l));

  return { headers, rows };
}

/** Strip inline markdown markers (**, *, __, _, `) from text. */
export function stripInlineMarkers(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, "$1")
    .replace(/__(.+?)__/g, "$1")
    .replace(/\*(.+?)\*/g, "$1")
    .replace(/_(.+?)_/g, "$1")
    .replace(/`(.+?)`/g, "$1")
    .replace(/\*{2,}/g, ""); // remove orphaned ** that didn't form pairs
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

export type LineDiff = {
  text: string;
  type: "unchanged" | "added" | "removed" | "modified";
  /** For modified lines, the before text (text holds the after). */
  before?: string;
};

/** Compute a line-level diff, pairing adjacent removed+added lines as modified. */
export function computeLineDiff(before: string, after: string): LineDiff[] {
  const changes = diffLines(before, after);

  // Flatten into individual lines tagged with their type
  type RawLine = { text: string; tag: "unchanged" | "added" | "removed" };
  const raw: RawLine[] = [];
  for (const change of changes) {
    const tag = change.added ? "added" : change.removed ? "removed" : "unchanged";
    // diffLines keeps trailing \n on each value; split and filter empties
    const lines = change.value.replace(/\n$/, "").split("\n");
    for (const line of lines) {
      raw.push({ text: line, tag });
    }
  }

  // Pair consecutive removed+added lines as modified
  const result: LineDiff[] = [];
  let i = 0;
  while (i < raw.length) {
    if (raw[i].tag === "removed") {
      const removedRun: string[] = [];
      while (i < raw.length && raw[i].tag === "removed") {
        removedRun.push(raw[i].text);
        i++;
      }
      const addedRun: string[] = [];
      while (i < raw.length && raw[i].tag === "added") {
        addedRun.push(raw[i].text);
        i++;
      }
      const pairs = Math.min(removedRun.length, addedRun.length);
      for (let p = 0; p < pairs; p++) {
        result.push({ type: "modified", text: addedRun[p], before: removedRun[p] });
      }
      for (let p = pairs; p < removedRun.length; p++) {
        result.push({ type: "removed", text: removedRun[p] });
      }
      for (let p = pairs; p < addedRun.length; p++) {
        result.push({ type: "added", text: addedRun[p] });
      }
    } else {
      result.push({ type: raw[i].tag, text: raw[i].text });
      i++;
    }
  }

  return result;
}

// ── Block-level diff ─────────────────────────────────────────────────

export type BlockDiff =
  | { type: "unchanged"; blocks: string[] }
  | { type: "added"; block: string }
  | { type: "removed"; block: string }
  | { type: "modified"; before: string; after: string };

/**
 * Split markdown into blocks on blank lines, keeping fenced code blocks intact.
 * Each returned block is trimmed of surrounding blank lines.
 */
export function splitIntoBlocks(md: string): string[] {
  const lines = md.split("\n");
  const blocks: string[] = [];
  let current: string[] = [];
  let inFence = false;

  for (const line of lines) {
    if (/^```/.test(line.trimStart())) {
      inFence = !inFence;
      current.push(line);
      continue;
    }

    if (inFence) {
      current.push(line);
      continue;
    }

    if (line.trim() === "") {
      if (current.length > 0) {
        blocks.push(current.join("\n"));
        current = [];
      }
    } else {
      current.push(line);
    }
  }

  if (current.length > 0) {
    blocks.push(current.join("\n"));
  }

  return blocks;
}

/** Returns true for plain prose (no heading, list, table, blockquote, or code fence markers). */
export function isSimpleParagraph(block: string): boolean {
  const first = block.trimStart();
  if (/^#{1,6}\s/.test(first)) return false;
  if (/^[-*+]\s/.test(first)) return false;
  if (/^\d+\.\s/.test(first)) return false;
  if (first.startsWith("|")) return false;
  if (first.startsWith(">")) return false;
  if (first.startsWith("```")) return false;
  return true;
}

/** Normalize a block for comparison: strip formatting, collapse whitespace, lowercase. */
function normalizeBlock(block: string): string {
  return stripInlineMarkers(block)
    .replace(/[\u00A0\u200B\u200C\u200D\uFEFF]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

/**
 * Compute a block-level diff between two markdown strings.
 * Consecutive removed+added runs are paired as `modified`.
 * Consecutive unchanged blocks are grouped.
 */
export function computeBlockDiff(before: string, after: string): BlockDiff[] {
  const blocksA = splitIntoBlocks(before);
  const blocksB = splitIntoBlocks(after);

  const changes = diffArrays(blocksA, blocksB, {
    comparator: (a: string, b: string) =>
      normalizeBlock(a) === normalizeBlock(b),
  });

  // Flatten into a raw list of tagged blocks
  type RawEntry =
    | { tag: "unchanged"; block: string }
    | { tag: "added"; block: string }
    | { tag: "removed"; block: string };

  const raw: RawEntry[] = [];
  for (const change of changes) {
    const tag = change.added ? "added" : change.removed ? "removed" : "unchanged";
    for (const block of change.value) {
      raw.push({ tag, block } as RawEntry);
    }
  }

  // Post-process: pair removed+added as modified, group unchanged
  const result: BlockDiff[] = [];
  let i = 0;

  while (i < raw.length) {
    const entry = raw[i];

    if (entry.tag === "unchanged") {
      // Group consecutive unchanged
      const group: string[] = [];
      while (i < raw.length && raw[i].tag === "unchanged") {
        group.push(raw[i].block);
        i++;
      }
      result.push({ type: "unchanged", blocks: group });
      continue;
    }

    if (entry.tag === "removed") {
      // Collect consecutive removed, then consecutive added, pair them
      const removedRun: string[] = [];
      while (i < raw.length && raw[i].tag === "removed") {
        removedRun.push(raw[i].block);
        i++;
      }
      const addedRun: string[] = [];
      while (i < raw.length && raw[i].tag === "added") {
        addedRun.push(raw[i].block);
        i++;
      }

      const pairs = Math.min(removedRun.length, addedRun.length);
      for (let p = 0; p < pairs; p++) {
        result.push({ type: "modified", before: removedRun[p], after: addedRun[p] });
      }
      for (let p = pairs; p < removedRun.length; p++) {
        result.push({ type: "removed", block: removedRun[p] });
      }
      for (let p = pairs; p < addedRun.length; p++) {
        result.push({ type: "added", block: addedRun[p] });
      }
      continue;
    }

    if (entry.tag === "added") {
      result.push({ type: "added", block: entry.block });
      i++;
      continue;
    }

    i++;
  }

  return result;
}
