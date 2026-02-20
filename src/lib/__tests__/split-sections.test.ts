import { describe, it, expect } from "vitest";
import { splitIntoSections } from "@shared/split-sections";

describe("splitIntoSections", () => {
  it("splits on h1 headings", () => {
    const md = "# First\nContent 1\n# Second\nContent 2";
    const sections = splitIntoSections(md);
    expect(sections).toHaveLength(2);
    expect(sections[0]).toEqual({ title: "First", content: "Content 1" });
    expect(sections[1]).toEqual({ title: "Second", content: "Content 2" });
  });

  it("falls back to h2 when no h1 headings exist", () => {
    const md = "## Intro\nParagraph\n## Body\nMore text";
    const sections = splitIntoSections(md);
    expect(sections).toHaveLength(2);
    expect(sections[0].title).toBe("Intro");
    expect(sections[1].title).toBe("Body");
  });

  it("returns entire text as one section when no headings found", () => {
    const md = "Just some text\nwith no headings";
    const sections = splitIntoSections(md);
    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe("Playbook");
    expect(sections[0].content).toBe("Just some text\nwith no headings");
  });

  it("uses custom fallback title", () => {
    const md = "No headings here";
    const sections = splitIntoSections(md, "Custom Title");
    expect(sections[0].title).toBe("Custom Title");
  });

  it("trims whitespace from content", () => {
    const md = "# Section\n\n  Content with whitespace  \n\n";
    const sections = splitIntoSections(md);
    expect(sections[0].content).toBe("Content with whitespace");
  });

  it("handles content before the first heading (discards it)", () => {
    const md = "Preamble text\n# First\nContent";
    const sections = splitIntoSections(md);
    expect(sections).toHaveLength(1);
    expect(sections[0].title).toBe("First");
  });

  it("preserves sub-headings within sections", () => {
    const md = "# Main\n## Sub\nContent under sub\n### Deep\nDeep content";
    const sections = splitIntoSections(md);
    expect(sections).toHaveLength(1);
    expect(sections[0].content).toContain("## Sub");
    expect(sections[0].content).toContain("### Deep");
  });

  it("handles empty content sections", () => {
    const md = "# Empty Section\n# Next Section\nHas content";
    const sections = splitIntoSections(md);
    expect(sections).toHaveLength(2);
    expect(sections[0].content).toBe("");
    expect(sections[1].content).toBe("Has content");
  });
});
