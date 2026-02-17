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
