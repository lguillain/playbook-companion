export type Heading = {
  text: string;
  level: number;
  slug: string;
};

/** Turn heading text into a URL-safe slug. */
function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

/**
 * Extract h2–h4 headings from markdown text.
 * Skips h1 since that's typically the section title.
 * Deduplicates slugs by appending `-2`, `-3`, etc.
 */
export function extractHeadings(markdown: string): Heading[] {
  const headings: Heading[] = [];
  const slugCounts = new Map<string, number>();

  for (const line of markdown.split("\n")) {
    const match = line.match(/^(#{2,4})\s+(.+)/);
    if (!match) continue;

    const level = match[1].length;
    const text = match[2].replace(/\*\*/g, "").replace(/`/g, "").trim();
    let slug = slugify(text);

    const count = slugCounts.get(slug) ?? 0;
    slugCounts.set(slug, count + 1);
    if (count > 0) slug = `${slug}-${count + 1}`;

    headings.push({ text, level, slug });
  }

  return headings;
}
