/**
 * Convert TipTap JSON to Notion block API format.
 * Direct node-to-node mapping — no regex, no markdown intermediate.
 */

import type { TipTapDoc, TipTapNode, TipTapMark } from "./tiptap-markdown.ts";

// Notion API types (subset)
type NotionRichText = {
  type: "text";
  text: { content: string; link?: { url: string } | null };
  annotations?: {
    bold?: boolean;
    italic?: boolean;
    strikethrough?: boolean;
    underline?: boolean;
    code?: boolean;
  };
};

type NotionBlock = {
  object: "block";
  type: string;
  [key: string]: unknown;
};

export function jsonToNotion(doc: TipTapDoc): NotionBlock[] {
  return flattenBlocks(doc.content ?? []);
}

function flattenBlocks(nodes: TipTapNode[]): NotionBlock[] {
  const blocks: NotionBlock[] = [];
  for (const node of nodes) {
    blocks.push(...nodeToBlocks(node));
  }
  return blocks;
}

function nodeToBlocks(node: TipTapNode): NotionBlock[] {
  switch (node.type) {
    case "paragraph": {
      const richText = inlineToRichText(node.content ?? []);
      return [{
        object: "block",
        type: "paragraph",
        paragraph: { rich_text: richText },
      }];
    }

    case "heading": {
      const level = (node.attrs?.level as number) ?? 1;
      const richText = inlineToRichText(node.content ?? []);
      const headingType = level <= 1 ? "heading_1" : level === 2 ? "heading_2" : "heading_3";
      return [{
        object: "block",
        type: headingType,
        [headingType]: { rich_text: richText },
      }];
    }

    case "bulletList":
      return (node.content ?? []).flatMap((item) => listItemToBlock(item, "bulleted_list_item"));

    case "orderedList":
      return (node.content ?? []).flatMap((item) => listItemToBlock(item, "numbered_list_item"));

    case "codeBlock": {
      const code = (node.content ?? []).map((n) => n.text ?? "").join("");
      const lang = (node.attrs?.language as string) ?? "plain text";
      return [{
        object: "block",
        type: "code",
        code: {
          rich_text: [{ type: "text", text: { content: code } }],
          language: lang,
        },
      }];
    }

    case "blockquote": {
      const children = flattenBlocks(node.content ?? []);
      // Notion quotes need rich_text; use first paragraph's text, nest rest as children
      const firstText = children.length > 0 && children[0].type === "paragraph"
        ? (children[0].paragraph as { rich_text: NotionRichText[] }).rich_text
        : [{ type: "text" as const, text: { content: "" } }];
      const restChildren = children.length > 1 ? children.slice(1) : undefined;
      return [{
        object: "block",
        type: "quote",
        quote: {
          rich_text: firstText,
          ...(restChildren ? { children: restChildren } : {}),
        },
      }];
    }

    case "table": {
      const rows = node.content ?? [];
      const hasHeader = rows.length > 0 && rows[0].content?.some((c) => c.type === "tableHeader");
      const tableWidth = Math.max(...rows.map((r) => (r.content ?? []).length), 1);

      const tableRows: NotionBlock[] = rows.map((row) => {
        const cells = (row.content ?? []).map((cell) => {
          return inlineToRichText(
            (cell.content ?? []).flatMap((p) => p.content ?? [])
          );
        });
        // Pad cells to table width
        while (cells.length < tableWidth) {
          cells.push([{ type: "text", text: { content: "" } }]);
        }
        return {
          object: "block" as const,
          type: "table_row",
          table_row: { cells },
        };
      });

      return [{
        object: "block",
        type: "table",
        table: {
          table_width: tableWidth,
          has_column_header: hasHeader,
          has_row_header: false,
          children: tableRows,
        },
      }];
    }

    case "horizontalRule":
      return [{
        object: "block",
        type: "divider",
        divider: {},
      }];

    default:
      if (node.content) return flattenBlocks(node.content);
      return [];
  }
}

function listItemToBlock(
  item: TipTapNode,
  blockType: "bulleted_list_item" | "numbered_list_item",
): NotionBlock[] {
  const children = item.content ?? [];
  const firstParagraph = children.find((c) => c.type === "paragraph");
  const richText = firstParagraph
    ? inlineToRichText(firstParagraph.content ?? [])
    : [{ type: "text" as const, text: { content: "" } }];

  // Nested lists become children
  const nestedBlocks = children
    .filter((c) => c.type === "bulletList" || c.type === "orderedList")
    .flatMap((c) => flattenBlocks([c]));

  return [{
    object: "block",
    type: blockType,
    [blockType]: {
      rich_text: richText,
      ...(nestedBlocks.length > 0 ? { children: nestedBlocks } : {}),
    },
  }];
}

function inlineToRichText(nodes: TipTapNode[]): NotionRichText[] {
  const result: NotionRichText[] = [];
  for (const node of nodes) {
    if (node.type !== "text" || !node.text) continue;
    result.push(textNodeToRichText(node));
  }
  if (result.length === 0) {
    result.push({ type: "text", text: { content: "" } });
  }
  return result;
}

function textNodeToRichText(node: TipTapNode): NotionRichText {
  const annotations: NotionRichText["annotations"] = {};
  let link: { url: string } | null = null;

  if (node.marks) {
    for (const mark of node.marks) {
      switch (mark.type) {
        case "bold":
          annotations.bold = true;
          break;
        case "italic":
          annotations.italic = true;
          break;
        case "code":
          annotations.code = true;
          break;
        case "strike":
          annotations.strikethrough = true;
          break;
        case "underline":
          annotations.underline = true;
          break;
        case "link":
          link = { url: (mark.attrs?.href as string) ?? "" };
          break;
      }
    }
  }

  const hasAnnotations = Object.values(annotations).some(Boolean);

  return {
    type: "text",
    text: { content: node.text ?? "", ...(link ? { link } : {}) },
    ...(hasAnnotations ? { annotations } : {}),
  };
}
