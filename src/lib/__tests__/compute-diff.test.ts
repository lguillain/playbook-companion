import { describe, it, expect } from "vitest";
import {
  containsTable,
  fixGfmTables,
  parsePipeTable,
  computeDiffSegments,
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
