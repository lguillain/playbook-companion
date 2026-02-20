import { describe, it, expect } from "vitest";
import {
  containsTable,
  fixGfmTables,
  parsePipeTable,
  computeDiffSegments,
  splitIntoBlocks,
  isSimpleParagraph,
  computeBlockDiff,
} from "../compute-diff";

describe("containsTable", () => {
  it("returns true for 2+ consecutive pipe lines", () => {
    const md = "| Name | Age |\n| Alice | 30 |";
    expect(containsTable(md)).toBe(true);
  });

  it("returns false for a single pipe line", () => {
    expect(containsTable("| just one line |")).toBe(false);
  });

  it("returns false for non-table content", () => {
    expect(containsTable("Hello world\nNo tables here")).toBe(false);
  });

  it("returns false for empty string", () => {
    expect(containsTable("")).toBe(false);
  });

  it("returns true when pipe lines are separated by non-pipe lines but has another consecutive block", () => {
    const md = "| A |\nno pipe\n| B |\n| C |";
    expect(containsTable(md)).toBe(true);
  });

  it("handles leading whitespace on pipe lines", () => {
    const md = "  | Name | Age |\n  | Alice | 30 |";
    expect(containsTable(md)).toBe(true);
  });
});

describe("fixGfmTables", () => {
  it("inserts separator after header row when missing", () => {
    const input = "| Name | Age |\n| Alice | 30 |";
    const result = fixGfmTables(input);
    const lines = result.split("\n");
    expect(lines).toHaveLength(3);
    expect(lines[1]).toMatch(/\|\s*---\s*\|\s*---\s*\|/);
  });

  it("does not insert separator when one already exists", () => {
    const input = "| Name | Age |\n| --- | --- |\n| Alice | 30 |";
    const result = fixGfmTables(input);
    expect(result).toBe(input);
  });

  it("leaves non-table content unchanged", () => {
    const input = "Hello world\nNo tables here";
    expect(fixGfmTables(input)).toBe(input);
  });

  it("handles multiple columns", () => {
    const input = "| A | B | C | D |\n| 1 | 2 | 3 | 4 |";
    const result = fixGfmTables(input);
    const lines = result.split("\n");
    expect(lines[1]).toContain("---");
    // Should have 4 separator cells
    expect(lines[1].match(/---/g)?.length).toBe(4);
  });
});

describe("parsePipeTable", () => {
  it("parses a standard GFM table", () => {
    const md = "| Name | Age |\n| --- | --- |\n| Alice | 30 |\n| Bob | 25 |";
    const result = parsePipeTable(md);
    expect(result).not.toBeNull();
    expect(result!.headers).toEqual(["Name", "Age"]);
    expect(result!.rows).toEqual([
      ["Alice", "30"],
      ["Bob", "25"],
    ]);
  });

  it("parses a table without separator row", () => {
    const md = "| Name | Age |\n| Alice | 30 |";
    const result = parsePipeTable(md);
    expect(result).not.toBeNull();
    expect(result!.headers).toEqual(["Name", "Age"]);
    expect(result!.rows).toEqual([["Alice", "30"]]);
  });

  it("returns null for empty string", () => {
    expect(parsePipeTable("")).toBeNull();
  });

  it("returns null for non-table content", () => {
    expect(parsePipeTable("no tables here")).toBeNull();
  });

  it("filters out blank lines", () => {
    const md = "| A | B |\n\n| 1 | 2 |";
    const result = parsePipeTable(md);
    expect(result).not.toBeNull();
    expect(result!.headers).toEqual(["A", "B"]);
  });
});

describe("computeDiffSegments", () => {
  it("returns a single unchanged segment for identical strings", () => {
    const result = computeDiffSegments("hello", "hello");
    expect(result).toEqual([{ text: "hello", type: "unchanged" }]);
  });

  it("detects added text", () => {
    const result = computeDiffSegments("hello", "hello world");
    const added = result.filter((s) => s.type === "added");
    expect(added.length).toBeGreaterThan(0);
    expect(added.some((s) => s.text.includes("world"))).toBe(true);
  });

  it("detects removed text", () => {
    const result = computeDiffSegments("hello world", "hello");
    const removed = result.filter((s) => s.type === "removed");
    expect(removed.length).toBeGreaterThan(0);
    expect(removed.some((s) => s.text.includes("world"))).toBe(true);
  });

  it("handles completely different strings", () => {
    const result = computeDiffSegments("alpha", "beta");
    expect(result.some((s) => s.type === "removed")).toBe(true);
    expect(result.some((s) => s.type === "added")).toBe(true);
  });

  it("handles empty before string", () => {
    const result = computeDiffSegments("", "new content");
    expect(result).toEqual([{ text: "new content", type: "added" }]);
  });

  it("handles empty after string", () => {
    const result = computeDiffSegments("old content", "");
    expect(result).toEqual([{ text: "old content", type: "removed" }]);
  });
});

describe("splitIntoBlocks", () => {
  it("returns empty array for empty input", () => {
    expect(splitIntoBlocks("")).toEqual([]);
  });

  it("returns a single block when no blank lines", () => {
    expect(splitIntoBlocks("hello world")).toEqual(["hello world"]);
  });

  it("splits on blank lines", () => {
    const md = "First paragraph\n\nSecond paragraph\n\nThird paragraph";
    expect(splitIntoBlocks(md)).toEqual([
      "First paragraph",
      "Second paragraph",
      "Third paragraph",
    ]);
  });

  it("keeps multi-line blocks together", () => {
    const md = "Line one\nLine two\n\nAnother block";
    expect(splitIntoBlocks(md)).toEqual(["Line one\nLine two", "Another block"]);
  });

  it("keeps fenced code blocks intact even with blank lines inside", () => {
    const md = "Before\n\n```js\nconst x = 1;\n\nconst y = 2;\n```\n\nAfter";
    const blocks = splitIntoBlocks(md);
    expect(blocks).toHaveLength(3);
    expect(blocks[0]).toBe("Before");
    expect(blocks[1]).toContain("const x = 1;\n\nconst y = 2;");
    expect(blocks[2]).toBe("After");
  });

  it("handles multiple consecutive blank lines", () => {
    const md = "A\n\n\n\nB";
    expect(splitIntoBlocks(md)).toEqual(["A", "B"]);
  });
});

describe("isSimpleParagraph", () => {
  it("returns true for plain prose", () => {
    expect(isSimpleParagraph("This is a simple paragraph.")).toBe(true);
  });

  it("returns false for headings", () => {
    expect(isSimpleParagraph("## Heading")).toBe(false);
    expect(isSimpleParagraph("# H1")).toBe(false);
  });

  it("returns false for unordered lists", () => {
    expect(isSimpleParagraph("- Item one\n- Item two")).toBe(false);
    expect(isSimpleParagraph("* Item")).toBe(false);
  });

  it("returns false for ordered lists", () => {
    expect(isSimpleParagraph("1. First\n2. Second")).toBe(false);
  });

  it("returns false for pipe tables", () => {
    expect(isSimpleParagraph("| A | B |")).toBe(false);
  });

  it("returns false for blockquotes", () => {
    expect(isSimpleParagraph("> Quote")).toBe(false);
  });

  it("returns false for code fences", () => {
    expect(isSimpleParagraph("```js\ncode\n```")).toBe(false);
  });

  it("returns true for text with inline formatting", () => {
    expect(isSimpleParagraph("This has **bold** and *italic*")).toBe(true);
  });
});

describe("computeBlockDiff", () => {
  it("returns empty array for two empty strings", () => {
    expect(computeBlockDiff("", "")).toEqual([]);
  });

  it("returns all unchanged for identical content", () => {
    const md = "Hello world\n\nSecond block";
    const result = computeBlockDiff(md, md);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("unchanged");
    if (result[0].type === "unchanged") {
      expect(result[0].blocks).toEqual(["Hello world", "Second block"]);
    }
  });

  it("detects all-added when before is empty", () => {
    const result = computeBlockDiff("", "New block\n\nAnother");
    expect(result.every((d) => d.type === "added")).toBe(true);
    expect(result).toHaveLength(2);
  });

  it("detects all-removed when after is empty", () => {
    const result = computeBlockDiff("Old block\n\nAnother", "");
    expect(result.every((d) => d.type === "removed")).toBe(true);
    expect(result).toHaveLength(2);
  });

  it("pairs removed+added as modified", () => {
    const before = "Hello world";
    const after = "Hello universe";
    const result = computeBlockDiff(before, after);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("modified");
    if (result[0].type === "modified") {
      expect(result[0].before).toBe("Hello world");
      expect(result[0].after).toBe("Hello universe");
    }
  });

  it("handles mixed changes", () => {
    const before = "Unchanged\n\nOld text\n\nAlso unchanged";
    const after = "Unchanged\n\nNew text\n\nAlso unchanged";
    const result = computeBlockDiff(before, after);

    const types = result.map((d) => d.type);
    expect(types).toContain("unchanged");
    expect(types).toContain("modified");
  });

  it("treats whitespace-only differences as unchanged", () => {
    const before = "Hello  world";
    const after = "Hello world";
    const result = computeBlockDiff(before, after);
    expect(result).toHaveLength(1);
    expect(result[0].type).toBe("unchanged");
  });

  it("handles extra blocks added at end", () => {
    const before = "Intro paragraph";
    const after = "Intro paragraph\n\nNew section";
    const result = computeBlockDiff(before, after);
    expect(result.some((d) => d.type === "unchanged")).toBe(true);
    expect(result.some((d) => d.type === "added")).toBe(true);
  });
});
