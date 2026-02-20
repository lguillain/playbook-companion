/**
 * TipTap JSON → Markdown serializer for the browser.
 * Ported from supabase/functions/_shared/tiptap-markdown.ts.
 *
 * The npm `tiptap-markdown` package outputs `[table]` for tables it deems
 * non-serializable (when html mode is off). This custom serializer always
 * produces valid pipe-delimited markdown for tables.
 */

type TipTapMark = { type: string; attrs?: Record<string, unknown> };
type TipTapNode = {
  type: string;
  content?: TipTapNode[];
  text?: string;
  marks?: TipTapMark[];
  attrs?: Record<string, unknown>;
};

export function tiptapToMarkdown(doc: { type: string; content?: TipTapNode[] }): string {
  return serializeNodes(doc.content ?? []).trimEnd() + "\n";
}

function serializeNodes(nodes: TipTapNode[], listIndent = 0): string {
  let out = "";
  for (const node of nodes) {
    out += serializeNode(node, listIndent);
  }
  return out;
}

function serializeNode(node: TipTapNode, listIndent = 0): string {
  switch (node.type) {
    case "paragraph":
      return serializeInline(node.content ?? []) + "\n\n";

    case "heading": {
      const level = (node.attrs?.level as number) ?? 1;
      return "#".repeat(level) + " " + serializeInline(node.content ?? []) + "\n\n";
    }

    case "bulletList":
      return serializeList(node.content ?? [], "bullet", listIndent);

    case "orderedList":
      return serializeList(node.content ?? [], "ordered", listIndent);

    case "listItem":
      return "";

    case "codeBlock": {
      const lang = (node.attrs?.language as string) ?? "";
      const code = (node.content ?? []).map((n) => n.text ?? "").join("");
      return "```" + lang + "\n" + code + "\n```\n\n";
    }

    case "blockquote": {
      const inner = serializeNodes(node.content ?? []);
      return (
        inner
          .split("\n")
          .map((line) => (line ? `> ${line}` : ">"))
          .join("\n") + "\n"
      );
    }

    case "table":
      return serializeTable(node) + "\n";

    case "horizontalRule":
      return "---\n\n";

    case "text":
      return serializeText(node);

    default:
      if (node.content) return serializeNodes(node.content, listIndent);
      return node.text ?? "";
  }
}

function serializeList(items: TipTapNode[], style: "bullet" | "ordered", indent: number): string {
  let out = "";
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const prefix = "  ".repeat(indent) + (style === "bullet" ? "- " : `${i + 1}. `);
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
  return nodes.map(serializeText).join("");
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
      return serializeInline((cell.content ?? []).flatMap((p) => p.content ?? []));
    });
    if (i === 0 && row.content?.some((c) => c.type === "tableHeader")) {
      isFirstRowHeader = true;
    }
    tableData.push(cells);
  }

  if (tableData.length === 0) return "";

  const colCount = Math.max(...tableData.map((r) => r.length));
  const lines: string[] = [];

  const headerRow = tableData[0].map((c) => c || " ");
  while (headerRow.length < colCount) headerRow.push(" ");
  lines.push("| " + headerRow.join(" | ") + " |");
  lines.push("| " + Array(colCount).fill("---").join(" | ") + " |");

  const startIdx = isFirstRowHeader ? 1 : 0;
  for (let i = startIdx; i < tableData.length; i++) {
    const row = tableData[i];
    while (row.length < colCount) row.push(" ");
    lines.push("| " + row.join(" | ") + " |");
  }

  return lines.join("\n") + "\n";
}
