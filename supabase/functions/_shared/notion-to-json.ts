/**
 * Convert Notion block API responses directly to TipTap JSON.
 * No markdown intermediate — direct node-to-node mapping.
 */

import type { TipTapDoc, TipTapNode, TipTapMark } from "./tiptap-markdown.ts";

type NotionRichText = {
  type: string;
  plain_text: string;
  text?: { content: string; link?: { url: string } | null };
  annotations?: {
    bold?: boolean;
    italic?: boolean;
    strikethrough?: boolean;
    underline?: boolean;
    code?: boolean;
  };
};

type NotionBlock = {
  type: string;
  [key: string]: unknown;
};

export function notionToJson(blocks: NotionBlock[]): TipTapDoc {
  const nodes = blocksToNodes(blocks);
  return { type: "doc", content: nodes.length > 0 ? nodes : [{ type: "paragraph" }] };
}

function blocksToNodes(blocks: NotionBlock[]): TipTapNode[] {
  const nodes: TipTapNode[] = [];
  let i = 0;

  while (i < blocks.length) {
    const block = blocks[i] as Record<string, any>;

    switch (block.type) {
      case "paragraph": {
        const richText = richTextToInline(block.paragraph?.rich_text ?? []);
        if (richText.length > 0) {
          nodes.push({ type: "paragraph", content: richText });
        }
        i++;
        break;
      }

      case "heading_1": {
        nodes.push({
          type: "heading",
          attrs: { level: 1 },
          content: richTextToInline(block.heading_1?.rich_text ?? []),
        });
        i++;
        break;
      }

      case "heading_2": {
        nodes.push({
          type: "heading",
          attrs: { level: 2 },
          content: richTextToInline(block.heading_2?.rich_text ?? []),
        });
        i++;
        break;
      }

      case "heading_3": {
        nodes.push({
          type: "heading",
          attrs: { level: 3 },
          content: richTextToInline(block.heading_3?.rich_text ?? []),
        });
        i++;
        break;
      }

      case "bulleted_list_item": {
        // Collect consecutive bulleted_list_items into a bulletList
        const items: TipTapNode[] = [];
        while (i < blocks.length && blocks[i].type === "bulleted_list_item") {
          const b = blocks[i] as Record<string, any>;
          const itemContent: TipTapNode[] = [{
            type: "paragraph",
            content: richTextToInline(b.bulleted_list_item?.rich_text ?? []),
          }];
          // Handle nested children if present
          if (b.bulleted_list_item?.children) {
            const nested = blocksToNodes(b.bulleted_list_item.children);
            itemContent.push(...nested);
          }
          items.push({ type: "listItem", content: itemContent });
          i++;
        }
        nodes.push({ type: "bulletList", content: items });
        break;
      }

      case "numbered_list_item": {
        const items: TipTapNode[] = [];
        while (i < blocks.length && blocks[i].type === "numbered_list_item") {
          const b = blocks[i] as Record<string, any>;
          const itemContent: TipTapNode[] = [{
            type: "paragraph",
            content: richTextToInline(b.numbered_list_item?.rich_text ?? []),
          }];
          if (b.numbered_list_item?.children) {
            const nested = blocksToNodes(b.numbered_list_item.children);
            itemContent.push(...nested);
          }
          items.push({ type: "listItem", content: itemContent });
          i++;
        }
        nodes.push({ type: "orderedList", content: items });
        break;
      }

      case "to_do": {
        // Treat as bullet list items
        const items: TipTapNode[] = [];
        while (i < blocks.length && blocks[i].type === "to_do") {
          const b = blocks[i] as Record<string, any>;
          const checked = b.to_do?.checked ? "[x] " : "[ ] ";
          const inlineNodes = richTextToInline(b.to_do?.rich_text ?? []);
          // Prepend checkbox text
          if (inlineNodes.length > 0 && inlineNodes[0].type === "text") {
            inlineNodes[0] = { ...inlineNodes[0], text: checked + (inlineNodes[0].text ?? "") };
          } else {
            inlineNodes.unshift({ type: "text", text: checked });
          }
          items.push({
            type: "listItem",
            content: [{ type: "paragraph", content: inlineNodes }],
          });
          i++;
        }
        nodes.push({ type: "bulletList", content: items });
        break;
      }

      case "code": {
        const code = richTextToPlain(block.code?.rich_text ?? []);
        const lang = (block.code?.language as string) ?? "";
        nodes.push({
          type: "codeBlock",
          attrs: lang && lang !== "plain text" ? { language: lang } : {},
          content: code ? [{ type: "text", text: code }] : undefined,
        });
        i++;
        break;
      }

      case "quote": {
        const quoteInline = richTextToInline(block.quote?.rich_text ?? []);
        const quoteContent: TipTapNode[] = [];
        if (quoteInline.length > 0) {
          quoteContent.push({ type: "paragraph", content: quoteInline });
        }
        // Handle children within quote
        if ((block as Record<string, any>).quote?.children) {
          const nested = blocksToNodes((block as Record<string, any>).quote.children);
          quoteContent.push(...nested);
        }
        nodes.push({
          type: "blockquote",
          content: quoteContent.length > 0 ? quoteContent : [{ type: "paragraph" }],
        });
        i++;
        break;
      }

      case "callout": {
        // Treat callouts as blockquotes
        const calloutInline = richTextToInline(block.callout?.rich_text ?? []);
        nodes.push({
          type: "blockquote",
          content: calloutInline.length > 0
            ? [{ type: "paragraph", content: calloutInline }]
            : [{ type: "paragraph" }],
        });
        i++;
        break;
      }

      case "toggle": {
        // Treat toggles as blockquotes (content is hidden by default in Notion)
        const toggleInline = richTextToInline(block.toggle?.rich_text ?? []);
        nodes.push({
          type: "blockquote",
          content: toggleInline.length > 0
            ? [{ type: "paragraph", content: toggleInline }]
            : [{ type: "paragraph" }],
        });
        i++;
        break;
      }

      case "divider": {
        nodes.push({ type: "horizontalRule" });
        i++;
        break;
      }

      case "table": {
        const tableBlock = block as Record<string, any>;
        const tableRows = tableBlock.table?.children ?? [];
        const hasHeader = tableBlock.table?.has_column_header ?? false;
        const rows: TipTapNode[] = [];

        for (let r = 0; r < tableRows.length; r++) {
          const row = tableRows[r] as Record<string, any>;
          const cells = (row.table_row?.cells ?? []).map(
            (cellRichText: NotionRichText[], idx: number) => ({
              type: r === 0 && hasHeader ? "tableHeader" : "tableCell",
              content: [{ type: "paragraph", content: richTextToInline(cellRichText) }],
            })
          );
          rows.push({ type: "tableRow", content: cells });
        }

        if (rows.length > 0) {
          nodes.push({ type: "table", content: rows });
        }
        i++;
        break;
      }

      default:
        // Skip unsupported block types (images, embeds, etc.)
        i++;
        break;
    }
  }

  return nodes;
}

function richTextToPlain(richText: NotionRichText[]): string {
  return richText.map((t) => t.plain_text).join("");
}

function richTextToInline(richText: NotionRichText[]): TipTapNode[] {
  const nodes: TipTapNode[] = [];

  for (const rt of richText) {
    const text = rt.plain_text;
    if (!text) continue;

    const marks: TipTapMark[] = [];
    const annotations = rt.annotations;

    if (annotations?.bold) marks.push({ type: "bold" });
    if (annotations?.italic) marks.push({ type: "italic" });
    if (annotations?.code) marks.push({ type: "code" });
    if (annotations?.strikethrough) marks.push({ type: "strike" });
    if (annotations?.underline) marks.push({ type: "underline" });

    // Check for link
    const link = rt.text?.link;
    if (link?.url) {
      marks.push({ type: "link", attrs: { href: link.url } });
    }

    const node: TipTapNode = { type: "text", text };
    if (marks.length > 0) node.marks = marks;
    nodes.push(node);
  }

  if (nodes.length === 0) {
    nodes.push({ type: "text", text: " " });
  }

  return nodes;
}
