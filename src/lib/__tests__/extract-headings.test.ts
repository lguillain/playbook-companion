import { describe, it, expect } from "vitest";
import { extractHeadings } from "../extract-headings";

describe("extractHeadings", () => {
  it("extracts h2 headings", () => {
    const md = "## Introduction\nSome text\n## Conclusion\nMore text";
    const headings = extractHeadings(md);
    expect(headings).toHaveLength(2);
    expect(headings[0]).toEqual({ text: "Introduction", level: 2, slug: "introduction" });
    expect(headings[1]).toEqual({ text: "Conclusion", level: 2, slug: "conclusion" });
  });

  it("extracts h3 and h4 headings", () => {
    const md = "### Sub Section\n#### Deep Section";
    const headings = extractHeadings(md);
    expect(headings).toHaveLength(2);
    expect(headings[0].level).toBe(3);
    expect(headings[1].level).toBe(4);
  });

  it("skips h1 headings", () => {
    const md = "# Title\n## Subtitle";
    const headings = extractHeadings(md);
    expect(headings).toHaveLength(1);
    expect(headings[0].text).toBe("Subtitle");
  });

  it("skips h5+ headings", () => {
    const md = "##### Too deep\n## Valid";
    const headings = extractHeadings(md);
    expect(headings).toHaveLength(1);
    expect(headings[0].text).toBe("Valid");
  });

  it("strips bold markers from heading text", () => {
    const md = "## **Bold Heading**";
    const headings = extractHeadings(md);
    expect(headings[0].text).toBe("Bold Heading");
  });

  it("strips backticks from heading text", () => {
    const md = "## `Code` Heading";
    const headings = extractHeadings(md);
    expect(headings[0].text).toBe("Code Heading");
  });

  it("deduplicates slugs with -2, -3 suffixes", () => {
    const md = "## FAQ\n## FAQ\n## FAQ";
    const headings = extractHeadings(md);
    expect(headings[0].slug).toBe("faq");
    expect(headings[1].slug).toBe("faq-2");
    expect(headings[2].slug).toBe("faq-3");
  });

  it("creates URL-safe slugs", () => {
    const md = "## Hello World & Friends!";
    const headings = extractHeadings(md);
    expect(headings[0].slug).toBe("hello-world-friends");
  });

  it("returns empty array for no headings", () => {
    expect(extractHeadings("just some text")).toEqual([]);
  });

  it("returns empty array for empty string", () => {
    expect(extractHeadings("")).toEqual([]);
  });
});
