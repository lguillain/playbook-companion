/**
 * Convert TipTap JSON to Confluence storage format (XHTML).
 * Direct node-to-node mapping — no regex, no markdown intermediate.
 */

import type { TipTapDoc, TipTapNode, TipTapMark } from "./tiptap-markdown.ts";

export function jsonToConfluence(doc: TipTapDoc): string {
  return renderNodes(doc.content ?? []);
}

function renderNodes(nodes: TipTapNode[]): string {
  return nodes.map(renderNode).join("");
}

function renderNode(node: TipTapNode): string {
  switch (node.type) {
    case "paragraph":
      return `<p>${renderInline(node.content ?? [])}</p>\n`;

    case "heading": {
      const level = (node.attrs?.level as number) ?? 1;
      const tag = `h${level}`;
      return `<${tag}>${renderInline(node.content ?? [])}</${tag}>\n`;
    }

    case "bulletList":
      return `<ul>\n${renderListItems(node.content ?? [])}</ul>\n`;

    case "orderedList":
      return `<ol>\n${renderListItems(node.content ?? [])}</ol>\n`;

    case "listItem":
      return `<li>${renderListItemContent(node.content ?? [])}</li>\n`;

    case "codeBlock": {
      const lang = (node.attrs?.language as string) ?? "";
      const code = (node.content ?? []).map((n) => n.text ?? "").join("");
      const escaped = escapeXml(code);
      if (lang) {
        return `<ac:structured-macro ac:name="code"><ac:parameter ac:name="language">${lang}</ac:parameter><ac:plain-text-body><![CDATA[${escaped}]]></ac:plain-text-body></ac:structured-macro>\n`;
      }
      return `<ac:structured-macro ac:name="code"><ac:plain-text-body><![CDATA[${escaped}]]></ac:plain-text-body></ac:structured-macro>\n`;
    }

    case "blockquote":
      return `<blockquote>${renderNodes(node.content ?? [])}</blockquote>\n`;

    case "table":
      return `<table><tbody>\n${renderNodes(node.content ?? [])}</tbody></table>\n`;

    case "tableRow":
      return `<tr>${renderNodes(node.content ?? [])}</tr>\n`;

    case "tableHeader":
      return `<th>${renderCellContent(node.content ?? [])}</th>`;

    case "tableCell":
      return `<td>${renderCellContent(node.content ?? [])}</td>`;

    case "horizontalRule":
      return `<hr />\n`;

    case "text":
      return renderText(node);

    default:
      if (node.content) return renderNodes(node.content);
      return escapeXml(node.text ?? "");
  }
}

function renderListItems(items: TipTapNode[]): string {
  return items.map(renderNode).join("");
}

function renderListItemContent(children: TipTapNode[]): string {
  // If there's only one paragraph, render inline (no wrapping <p>)
  if (children.length === 1 && children[0].type === "paragraph") {
    return renderInline(children[0].content ?? []);
  }
  // Otherwise render all children as blocks
  return renderNodes(children);
}

function renderCellContent(children: TipTapNode[]): string {
  // Flatten paragraph content for table cells
  if (children.length === 1 && children[0].type === "paragraph") {
    return renderInline(children[0].content ?? []);
  }
  return renderNodes(children);
}

function renderInline(nodes: TipTapNode[]): string {
  return nodes.map(renderText).join("");
}

function renderText(node: TipTapNode): string {
  if (node.type !== "text" || !node.text) return "";
  let text = escapeXml(node.text);

  if (!node.marks || node.marks.length === 0) return text;

  // Apply marks inside-out
  for (const mark of node.marks) {
    text = applyMark(text, mark);
  }

  return text;
}

function applyMark(text: string, mark: TipTapMark): string {
  switch (mark.type) {
    case "bold":
      return `<strong>${text}</strong>`;
    case "italic":
      return `<em>${text}</em>`;
    case "code":
      return `<code>${text}</code>`;
    case "link": {
      const href = escapeXml((mark.attrs?.href as string) ?? "");
      return `<a href="${href}">${text}</a>`;
    }
    case "strike":
      return `<s>${text}</s>`;
    case "underline":
      return `<u>${text}</u>`;
    default:
      return text;
  }
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
