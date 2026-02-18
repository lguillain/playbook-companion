import { diffWords } from "diff";

/** Returns true if the markdown string contains a GFM table. */
export function containsTable(md: string): boolean {
  // A GFM table has a row of |...|, then a separator row like |---|---|
  return /^\|.+\|$/m.test(md) && /^\|[\s:]*-+[\s:]*/.test(md);
}

/**
 * Unified inline diff — wraps removed text in `<del>` and added text in `<ins>`.
 * Returns a single merged markdown string suitable for rendering with rehype-raw.
 */
export function computeInlineDiff(before: string, after: string): string {
  const changes = diffWords(before, after);
  const parts: string[] = [];

  for (const change of changes) {
    // Escape any existing HTML tags in the value to prevent injection
    const val = change.value;
    if (change.removed) {
      parts.push(`<del>${val}</del>`);
    } else if (change.added) {
      parts.push(`<ins>${val}</ins>`);
    } else {
      parts.push(val);
    }
  }

  return parts.join("");
}

/**
 * Returns the `before` string with `<del>` around removed words.
 * Added words are omitted — this is for the "before" panel of side-by-side.
 */
export function computeHighlightedBefore(
  before: string,
  after: string,
): string {
  const changes = diffWords(before, after);
  const parts: string[] = [];

  for (const change of changes) {
    if (change.added) continue;
    if (change.removed) {
      parts.push(`<del>${change.value}</del>`);
    } else {
      parts.push(change.value);
    }
  }

  return parts.join("");
}

/**
 * Returns the `after` string with `<ins>` around added words.
 * Removed words are omitted — this is for the "after" panel of side-by-side.
 */
export function computeHighlightedAfter(
  before: string,
  after: string,
): string {
  const changes = diffWords(before, after);
  const parts: string[] = [];

  for (const change of changes) {
    if (change.removed) continue;
    if (change.added) {
      parts.push(`<ins>${change.value}</ins>`);
    } else {
      parts.push(change.value);
    }
  }

  return parts.join("");
}
