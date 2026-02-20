import type { TipTapDoc, TipTapNode } from "./tiptap-markdown.ts";
import { tiptapToMarkdown } from "./tiptap-markdown.ts";

export type SplitSection = {
  title: string;
  content: string;
  contentJson: TipTapDoc;
};

/**
 * Split a TipTap JSON doc into sections by top-level heading nodes.
 * Tries h1 first; falls back to h2 if no h1s are found.
 * Returns `{ title, content, contentJson }[]`.
 */
export function splitJsonIntoSections(
  doc: TipTapDoc,
  fallbackTitle = "Playbook",
): SplitSection[] {
  const nodes = doc.content ?? [];

  // Determine which heading level to split on
  const hasH1 = nodes.some((n) => n.type === "heading" && n.attrs?.level === 1);
  const splitLevel = hasH1 ? 1 : 2;

  const sections: SplitSection[] = [];
  let currentTitle = "";
  let currentNodes: TipTapNode[] = [];

  function flushSection() {
    if (!currentTitle && currentNodes.length === 0) return;
    const sectionDoc: TipTapDoc = {
      type: "doc",
      content: currentNodes.length > 0 ? currentNodes : [{ type: "paragraph" }],
    };
    sections.push({
      title: currentTitle || fallbackTitle,
      content: tiptapToMarkdown(sectionDoc).trim(),
      contentJson: sectionDoc,
    });
  }

  for (const node of nodes) {
    if (node.type === "heading" && node.attrs?.level === splitLevel) {
      flushSection();
      // Extract heading text
      const headingText = (node.content ?? [])
        .map((n) => n.text ?? "")
        .join("")
        .trim();
      currentTitle = headingText || fallbackTitle;
      currentNodes = [];
    } else {
      currentNodes.push(node);
    }
  }

  flushSection();

  if (sections.length === 0) {
    const sectionDoc: TipTapDoc = {
      type: "doc",
      content: nodes.length > 0 ? nodes : [{ type: "paragraph" }],
    };
    sections.push({
      title: fallbackTitle,
      content: tiptapToMarkdown(sectionDoc).trim(),
      contentJson: sectionDoc,
    });
  }

  return sections;
}

/**
 * Split markdown into sections by top-level headings.
 * Tries `# ` (h1) first; falls back to `## ` (h2) if no h1s are found.
 * Returns `{ title, content }[]` — content does NOT include the heading line itself.
 */
export function splitIntoSections(
  markdown: string,
  fallbackTitle = "Playbook"
): { title: string; content: string }[] {
  // Decide which heading level to split on
  const hasH1 = /^# .+/m.test(markdown);
  const headingPrefix = hasH1 ? "# " : "## ";

  const sections: { title: string; content: string }[] = [];
  let currentTitle = "";
  let currentLines: string[] = [];

  for (const line of markdown.split("\n")) {
    const match = line.match(
      headingPrefix === "# " ? /^# (.+)/ : /^## (.+)/
    );
    if (match) {
      if (currentTitle) {
        sections.push({
          title: currentTitle,
          content: currentLines.join("\n").trim(),
        });
      }
      currentTitle = match[1].trim();
      currentLines = [];
    } else {
      currentLines.push(line);
    }
  }

  if (currentTitle) {
    sections.push({
      title: currentTitle,
      content: currentLines.join("\n").trim(),
    });
  }

  // If no headings found at all, return entire text as one section
  if (sections.length === 0) {
    sections.push({ title: fallbackTitle, content: markdown.trim() });
  }

  return sections;
}
