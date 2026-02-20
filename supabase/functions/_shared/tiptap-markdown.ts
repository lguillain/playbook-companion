/**
 * Lightweight TipTap JSON ↔ Markdown converter for Deno edge functions.
 * No TipTap/ProseMirror dependency — operates on the known, fixed node schema.
 *
 * Node types: doc, heading, paragraph, bulletList, orderedList, listItem,
 *   codeBlock, blockquote, table, tableRow, tableCell, tableHeader, horizontalRule
 * Text marks: bold, italic, code, link
 */

// ── Types ────────────────────────────────────────────────────────────

export type TipTapMark = {
  type: string;
  attrs?: Record<string, unknown>;
};

export type TipTapNode = {
  type: string;
  content?: TipTapNode[];
  text?: string;
  marks?: TipTapMark[];
  attrs?: Record<string, unknown>;
};

export type TipTapDoc = TipTapNode & { type: "doc" };

// ── JSON → Markdown ──────────────────────────────────────────────────

export function tiptapToMarkdown(doc: TipTapDoc): string {
  return serializeNodes(doc.content ?? []).trimEnd() + "\n";
}

function serializeNodes(nodes: TipTapNode[], listIndent = 0): string {
  let out = "";
  for (let i = 0; i < nodes.length; i++) {
    out += serializeNode(nodes[i], listIndent);
  }
  return out;
}

function serializeNode(node: TipTapNode, listIndent = 0): string {
  switch (node.type) {
    case "paragraph":
      return serializeInline(node.content ?? []) + "\n\n";

    case "heading": {
      const level = (node.attrs?.level as number) ?? 1;
      const prefix = "#".repeat(level);
      return `${prefix} ${serializeInline(node.content ?? [])}\n\n`;
    }

    case "bulletList":
      return serializeList(node.content ?? [], "bullet", listIndent);

    case "orderedList":
      return serializeList(node.content ?? [], "ordered", listIndent);

    case "listItem":
      // Handled by serializeList
      return "";

    case "codeBlock": {
      const lang = (node.attrs?.language as string) ?? "";
      const code = (node.content ?? []).map((n) => n.text ?? "").join("");
      return "```" + lang + "\n" + code + "\n```\n\n";
    }

    case "blockquote": {
      const inner = serializeNodes(node.content ?? []);
      return inner
        .split("\n")
        .map((line) => (line ? `> ${line}` : ">"))
        .join("\n") + "\n";
    }

    case "table":
      return serializeTable(node) + "\n";

    case "horizontalRule":
      return "---\n\n";

    case "text":
      return serializeText(node);

    default:
      // Unknown node: serialize children
      if (node.content) return serializeNodes(node.content, listIndent);
      return node.text ?? "";
  }
}

function serializeList(
  items: TipTapNode[],
  style: "bullet" | "ordered",
  indent: number,
): string {
  let out = "";
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const prefix =
      "  ".repeat(indent) + (style === "bullet" ? "- " : `${i + 1}. `);

    const children = item.content ?? [];
    for (let j = 0; j < children.length; j++) {
      const child = children[j];
      if (child.type === "paragraph") {
        if (j === 0) {
          out += prefix + serializeInline(child.content ?? []) + "\n";
        } else {
          out += "  ".repeat(indent) + "  " + serializeInline(child.content ?? []) + "\n";
        }
      } else if (child.type === "bulletList") {
        out += serializeList(child.content ?? [], "bullet", indent + 1);
      } else if (child.type === "orderedList") {
        out += serializeList(child.content ?? [], "ordered", indent + 1);
      } else {
        out += serializeNode(child, indent + 1);
      }
    }
  }
  out += "\n";
  return out;
}

function serializeInline(nodes: TipTapNode[]): string {
  return nodes.map((n) => serializeText(n)).join("");
}

function serializeText(node: TipTapNode): string {
  if (node.type !== "text" || !node.text) return "";
  let text = node.text;

  if (!node.marks || node.marks.length === 0) return text;

  for (const mark of node.marks) {
    switch (mark.type) {
      case "bold":
        text = `**${text}**`;
        break;
      case "italic":
        text = `_${text}_`;
        break;
      case "code":
        text = "`" + text + "`";
        break;
      case "link": {
        const href = (mark.attrs?.href as string) ?? "";
        text = `[${text}](${href})`;
        break;
      }
    }
  }

  return text;
}

function serializeTable(node: TipTapNode): string {
  const rows = node.content ?? [];
  if (rows.length === 0) return "";

  const tableData: string[][] = [];
  let isFirstRowHeader = false;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const cells = (row.content ?? []).map((cell) => {
      const inline = serializeInline(
        (cell.content ?? []).flatMap((p) => p.content ?? []),
      );
      return inline;
    });
    if (i === 0 && row.content?.some((c) => c.type === "tableHeader")) {
      isFirstRowHeader = true;
    }
    tableData.push(cells);
  }

  if (tableData.length === 0) return "";

  const colCount = Math.max(...tableData.map((r) => r.length));
  const lines: string[] = [];

  // Header row
  const headerRow = tableData[0].map((c) => c || " ");
  while (headerRow.length < colCount) headerRow.push(" ");
  lines.push("| " + headerRow.join(" | ") + " |");

  // Separator
  lines.push("| " + Array(colCount).fill("---").join(" | ") + " |");

  // Body rows
  const startIdx = isFirstRowHeader ? 1 : 0;
  if (!isFirstRowHeader) {
    // If first row isn't a header, we still used it as header, so no body offset needed
  }
  for (let i = startIdx; i < tableData.length; i++) {
    const row = tableData[i];
    while (row.length < colCount) row.push(" ");
    lines.push("| " + row.join(" | ") + " |");
  }

  return lines.join("\n") + "\n";
}

// ── Markdown → JSON ──────────────────────────────────────────────────

export function markdownToTiptap(md: string): TipTapDoc {
  const lines = md.split("\n");
  const nodes = parseBlocks(lines, 0, lines.length);
  return { type: "doc", content: nodes.length > 0 ? nodes : [{ type: "paragraph" }] };
}

interface ParseState {
  pos: number;
}

function parseBlocks(lines: string[], start: number, end: number): TipTapNode[] {
  const nodes: TipTapNode[] = [];
  const state: ParseState = { pos: start };

  while (state.pos < end) {
    const line = lines[state.pos];

    // Empty line — skip
    if (line.trim() === "") {
      state.pos++;
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.*)/);
    if (headingMatch) {
      const level = headingMatch[1].length;
      nodes.push({
        type: "heading",
        attrs: { level },
        content: parseInline(headingMatch[2]),
      });
      state.pos++;
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|\*{3,}|_{3,})\s*$/.test(line)) {
      nodes.push({ type: "horizontalRule" });
      state.pos++;
      continue;
    }

    // Code block
    if (line.trimStart().startsWith("```")) {
      const lang = line.trimStart().slice(3).trim();
      state.pos++;
      let code = "";
      while (state.pos < end && !lines[state.pos].trimStart().startsWith("```")) {
        code += (code ? "\n" : "") + lines[state.pos];
        state.pos++;
      }
      state.pos++; // skip closing ```
      nodes.push({
        type: "codeBlock",
        attrs: lang ? { language: lang } : {},
        content: code ? [{ type: "text", text: code }] : undefined,
      });
      continue;
    }

    // Table
    if (line.includes("|") && state.pos + 1 < end && /^\|?\s*-{3}/.test(lines[state.pos + 1]?.trim())) {
      const tableNode = parseTable(lines, state, end);
      if (tableNode) {
        nodes.push(tableNode);
        continue;
      }
    }

    // Blockquote
    if (line.trimStart().startsWith("> ") || line.trimStart() === ">") {
      const quoteLines: string[] = [];
      while (state.pos < end && (lines[state.pos].trimStart().startsWith("> ") || lines[state.pos].trimStart() === ">")) {
        quoteLines.push(lines[state.pos].replace(/^>\s?/, ""));
        state.pos++;
      }
      nodes.push({
        type: "blockquote",
        content: parseBlocks(quoteLines, 0, quoteLines.length),
      });
      continue;
    }

    // Unordered list
    if (/^\s*[-*+]\s/.test(line)) {
      nodes.push(parseList(lines, state, end, "bullet"));
      continue;
    }

    // Ordered list
    if (/^\s*\d+\.\s/.test(line)) {
      nodes.push(parseList(lines, state, end, "ordered"));
      continue;
    }

    // Paragraph — collect consecutive non-empty, non-special lines
    let text = line;
    state.pos++;
    while (
      state.pos < end &&
      lines[state.pos].trim() !== "" &&
      !lines[state.pos].match(/^#{1,6}\s/) &&
      !lines[state.pos].trimStart().startsWith("```") &&
      !lines[state.pos].trimStart().startsWith("> ") &&
      !/^\s*[-*+]\s/.test(lines[state.pos]) &&
      !/^\s*\d+\.\s/.test(lines[state.pos]) &&
      !/^(-{3,}|\*{3,}|_{3,})\s*$/.test(lines[state.pos])
    ) {
      text += " " + lines[state.pos];
      state.pos++;
    }
    nodes.push({ type: "paragraph", content: parseInline(text) });
  }

  return nodes;
}

function parseList(
  lines: string[],
  state: ParseState,
  end: number,
  style: "bullet" | "ordered",
): TipTapNode {
  const items: TipTapNode[] = [];
  const listPattern = style === "bullet" ? /^(\s*)[-*+]\s(.*)/ : /^(\s*)\d+\.\s(.*)/;
  const baseIndent = (lines[state.pos].match(/^\s*/)?.[0] ?? "").length;

  while (state.pos < end) {
    const line = lines[state.pos];
    const match = line.match(listPattern);

    if (!match) {
      // Check if this is a continuation or nested list at deeper indent
      const indent = (line.match(/^\s*/)?.[0] ?? "").length;
      if (indent > baseIndent && line.trim() !== "") {
        // This is a continuation line — skip to let nested parsing handle it
        break;
      }
      break;
    }

    const itemIndent = match[1].length;
    if (itemIndent < baseIndent) break;
    if (itemIndent > baseIndent) break; // Nested — handled recursively

    const itemContent: TipTapNode[] = [
      { type: "paragraph", content: parseInline(match[2]) },
    ];
    state.pos++;

    // Check for nested lists
    while (state.pos < end) {
      const nextLine = lines[state.pos];
      const nextIndent = (nextLine.match(/^\s*/)?.[0] ?? "").length;
      if (nextLine.trim() === "") {
        state.pos++;
        continue;
      }
      if (nextIndent <= baseIndent) break;

      if (/^\s*[-*+]\s/.test(nextLine)) {
        itemContent.push(parseList(lines, state, end, "bullet"));
      } else if (/^\s*\d+\.\s/.test(nextLine)) {
        itemContent.push(parseList(lines, state, end, "ordered"));
      } else {
        break;
      }
    }

    items.push({ type: "listItem", content: itemContent });
  }

  return {
    type: style === "bullet" ? "bulletList" : "orderedList",
    content: items,
  };
}

function parseTable(
  lines: string[],
  state: ParseState,
  end: number,
): TipTapNode | null {
  // Header row
  const headerLine = lines[state.pos].trim();
  const headerCells = splitTableRow(headerLine);
  state.pos++; // skip header

  // Separator row
  state.pos++; // skip separator

  const headerRow: TipTapNode = {
    type: "tableRow",
    content: headerCells.map((cell) => ({
      type: "tableHeader",
      content: [{ type: "paragraph", content: parseInline(cell.trim()) }],
    })),
  };

  const bodyRows: TipTapNode[] = [];
  while (state.pos < end && lines[state.pos].includes("|")) {
    const cells = splitTableRow(lines[state.pos].trim());
    bodyRows.push({
      type: "tableRow",
      content: cells.map((cell) => ({
        type: "tableCell",
        content: [{ type: "paragraph", content: parseInline(cell.trim()) }],
      })),
    });
    state.pos++;
  }

  return {
    type: "table",
    content: [headerRow, ...bodyRows],
  };
}

function splitTableRow(line: string): string[] {
  // Remove leading/trailing pipes
  let trimmed = line;
  if (trimmed.startsWith("|")) trimmed = trimmed.slice(1);
  if (trimmed.endsWith("|")) trimmed = trimmed.slice(0, -1);
  return trimmed.split("|");
}

// ── Inline parsing ───────────────────────────────────────────────────

function parseInline(text: string): TipTapNode[] {
  if (!text) return [{ type: "text", text: " " }];

  const nodes: TipTapNode[] = [];
  // Regex to match: **bold**, _italic_, `code`, [link](url)
  const pattern = /(\*\*(.+?)\*\*)|(_(.+?)_)|(`(.+?)`)|(\[(.+?)\]\((.+?)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    // Plain text before this match
    if (match.index > lastIndex) {
      nodes.push({ type: "text", text: text.slice(lastIndex, match.index) });
    }

    if (match[1]) {
      // Bold: **text**
      nodes.push({ type: "text", text: match[2], marks: [{ type: "bold" }] });
    } else if (match[3]) {
      // Italic: _text_
      nodes.push({ type: "text", text: match[4], marks: [{ type: "italic" }] });
    } else if (match[5]) {
      // Code: `text`
      nodes.push({ type: "text", text: match[6], marks: [{ type: "code" }] });
    } else if (match[7]) {
      // Link: [text](url)
      nodes.push({
        type: "text",
        text: match[8],
        marks: [{ type: "link", attrs: { href: match[9] } }],
      });
    }

    lastIndex = match.index + match[0].length;
  }

  // Remaining text
  if (lastIndex < text.length) {
    nodes.push({ type: "text", text: text.slice(lastIndex) });
  }

  // If nothing was parsed, return a single text node
  if (nodes.length === 0) {
    nodes.push({ type: "text", text });
  }

  return nodes;
}
