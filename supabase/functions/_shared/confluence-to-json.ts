/**
 * Convert Confluence storage format (XHTML) directly to TipTap JSON.
 * Parses tags sequentially — no external HTML parser needed.
 */

import type { TipTapDoc, TipTapNode, TipTapMark } from "./tiptap-markdown.ts";

export function confluenceToJson(html: string): TipTapDoc {
  const nodes = parseHtmlBlocks(html);
  return { type: "doc", content: nodes.length > 0 ? nodes : [{ type: "paragraph" }] };
}

// Simple tag-based parser (not a full HTML parser — handles Confluence storage format)

function parseHtmlBlocks(html: string): TipTapNode[] {
  const nodes: TipTapNode[] = [];
  let pos = 0;
  const len = html.length;

  while (pos < len) {
    // Skip whitespace
    while (pos < len && /\s/.test(html[pos])) pos++;
    if (pos >= len) break;

    if (html[pos] !== "<") {
      // Bare text — wrap in paragraph
      const end = html.indexOf("<", pos);
      const text = decodeEntities(html.slice(pos, end === -1 ? len : end).trim());
      if (text) {
        nodes.push({ type: "paragraph", content: [{ type: "text", text }] });
      }
      pos = end === -1 ? len : end;
      continue;
    }

    // Extract tag
    const tagMatch = html.slice(pos).match(/^<(\/?)([a-z][a-z0-9]*|ac:[a-z-]+)([^>]*?)(\/?)\s*>/i);
    if (!tagMatch) {
      pos++;
      continue;
    }

    const tagName = tagMatch[2].toLowerCase();
    const isClosing = tagMatch[1] === "/";
    const isSelfClosing = tagMatch[4] === "/";

    if (isClosing) {
      pos += tagMatch[0].length;
      continue;
    }

    // Self-closing tags
    if (isSelfClosing || tagName === "br" || tagName === "hr") {
      pos += tagMatch[0].length;
      if (tagName === "hr") {
        nodes.push({ type: "horizontalRule" });
      }
      continue;
    }

    // Extract inner content between opening and closing tag
    const openEnd = pos + tagMatch[0].length;
    const closeTag = `</${tagName}>`;
    const closeIdx = findMatchingClose(html, openEnd, tagName);
    const inner = html.slice(openEnd, closeIdx);
    pos = closeIdx + closeTag.length;

    switch (tagName) {
      case "h1": case "h2": case "h3": case "h4": case "h5": case "h6": {
        const level = parseInt(tagName[1]);
        nodes.push({
          type: "heading",
          attrs: { level },
          content: parseInline(inner),
        });
        break;
      }
      case "p": {
        const inlineContent = parseInline(inner);
        if (inlineContent.length > 0) {
          nodes.push({ type: "paragraph", content: inlineContent });
        }
        break;
      }
      case "ul":
        nodes.push({ type: "bulletList", content: parseListItems(inner) });
        break;
      case "ol":
        nodes.push({ type: "orderedList", content: parseListItems(inner) });
        break;
      case "blockquote":
        nodes.push({ type: "blockquote", content: parseHtmlBlocks(inner) });
        break;
      case "table":
        nodes.push(parseTable(inner));
        break;
      case "ac:structured-macro": {
        // Check macro name from the tag attributes
        const macroNameMatch = tagMatch[3].match(/ac:name="([^"]*)"/i);
        const macroName = macroNameMatch ? macroNameMatch[1].toLowerCase() : "";

        if (macroName === "code" || macroName === "noformat") {
          // Code block macro
          const codeMatch = inner.match(/<ac:plain-text-body><!\[CDATA\[([\s\S]*?)\]\]><\/ac:plain-text-body>/i);
          const langMatch = inner.match(/<ac:parameter\s+ac:name="language"[^>]*>([^<]*)<\/ac:parameter>/i);
          const code = codeMatch ? codeMatch[1] : "";
          const lang = langMatch ? langMatch[1] : "";
          nodes.push({
            type: "codeBlock",
            attrs: lang ? { language: lang } : {},
            content: code ? [{ type: "text", text: code }] : undefined,
          });
        } else {
          // Other macros (note, info, warning, tip, expand, etc.)
          // Extract rich-text-body or plain-text-body content
          const richBodyMatch = inner.match(/<ac:rich-text-body>([\s\S]*?)<\/ac:rich-text-body>/i);
          const plainBodyMatch = inner.match(/<ac:plain-text-body><!\[CDATA\[([\s\S]*?)\]\]><\/ac:plain-text-body>/i);
          if (richBodyMatch) {
            nodes.push(...parseHtmlBlocks(richBodyMatch[1]));
          } else if (plainBodyMatch) {
            const text = plainBodyMatch[1].trim();
            if (text) {
              nodes.push({ type: "paragraph", content: [{ type: "text", text }] });
            }
          }
        }
        break;
      }
      case "ac:inline-comment-marker":
      case "ins":
      case "del": {
        // Confluence inline comments and tracked changes — strip wrapper, keep content
        const innerContent = parseHtmlBlocks(inner);
        nodes.push(...innerContent);
        break;
      }
      default: {
        // Unknown block — try to extract content
        const blockContent = parseHtmlBlocks(inner);
        nodes.push(...blockContent);
      }
    }
  }

  return nodes;
}

function parseListItems(html: string): TipTapNode[] {
  const items: TipTapNode[] = [];
  const liRegex = /<li[^>]*>([\s\S]*?)<\/li>/gi;
  let match;

  while ((match = liRegex.exec(html)) !== null) {
    const innerHtml = match[1];
    // Check for nested lists
    const hasNestedList = /<[ou]l[^>]*>/i.test(innerHtml);

    if (hasNestedList) {
      const content: TipTapNode[] = [];
      // Extract text before nested list
      const beforeList = innerHtml.replace(/<[ou]l[\s\S]*$/i, "").trim();
      if (beforeList) {
        content.push({ type: "paragraph", content: parseInline(beforeList) });
      }
      // Extract nested lists
      const nestedListMatch = innerHtml.match(/<(ul|ol)[^>]*>([\s\S]*?)<\/\1>/gi);
      if (nestedListMatch) {
        for (const nested of nestedListMatch) {
          const isOrdered = /^<ol/i.test(nested);
          const innerContent = nested.replace(/^<[ou]l[^>]*>|<\/[ou]l>$/gi, "");
          const listNode: TipTapNode = {
            type: isOrdered ? "orderedList" : "bulletList",
            content: parseListItems(innerContent),
          };
          content.push(listNode);
        }
      }
      items.push({ type: "listItem", content });
    } else {
      items.push({
        type: "listItem",
        content: [{ type: "paragraph", content: parseInline(innerHtml) }],
      });
    }
  }

  return items;
}

function parseTable(html: string): TipTapNode {
  const rows: TipTapNode[] = [];
  const trRegex = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
  let match;

  while ((match = trRegex.exec(html)) !== null) {
    const rowHtml = match[1];
    const cells: TipTapNode[] = [];
    const cellRegex = /<(th|td)[^>]*>([\s\S]*?)<\/\1>/gi;
    let cellMatch;

    while ((cellMatch = cellRegex.exec(rowHtml)) !== null) {
      const isHeader = cellMatch[1].toLowerCase() === "th";
      const cellContent = cellMatch[2];
      cells.push({
        type: isHeader ? "tableHeader" : "tableCell",
        content: [{ type: "paragraph", content: parseInline(cellContent) }],
      });
    }

    if (cells.length > 0) {
      rows.push({ type: "tableRow", content: cells });
    }
  }

  return { type: "table", content: rows };
}

function parseInline(html: string): TipTapNode[] {
  // Pre-process: strip Confluence inline comment markers and tracked-change tags
  // These are transparent wrappers — keep inner text, discard the tag
  let cleaned = html;
  cleaned = cleaned.replace(/<\/?ac:inline-comment-marker[^>]*>/gi, "");
  cleaned = cleaned.replace(/<\/?ins[^>]*>/gi, "");
  cleaned = cleaned.replace(/<\/?del[^>]*>/gi, "");
  // Strip block-level tags that Confluence nests inside inline contexts (e.g. <p> inside <li>)
  cleaned = cleaned.replace(/<\/?p[^>]*>/gi, "");
  cleaned = cleaned.replace(/<\/?div[^>]*>/gi, "");

  const nodes: TipTapNode[] = [];
  // Simple inline tag parser
  const pattern = /<(strong|b|em|i|code|a|s|u|span)([^>]*)>([\s\S]*?)<\/\1>|([^<]+)|<br\s*\/?>/gi;
  let match;

  while ((match = pattern.exec(cleaned)) !== null) {
    if (match[4]) {
      // Plain text
      const text = decodeEntities(match[4]);
      if (text) nodes.push({ type: "text", text });
    } else if (match[0].startsWith("<br")) {
      // Line break — add as hard break or space
      continue;
    } else {
      const tag = match[1].toLowerCase();
      const attrs = match[2];
      const inner = decodeEntities(match[3]);

      if (!inner) continue;

      const marks: TipTapMark[] = [];
      switch (tag) {
        case "strong": case "b":
          marks.push({ type: "bold" });
          break;
        case "em": case "i":
          marks.push({ type: "italic" });
          break;
        case "code":
          marks.push({ type: "code" });
          break;
        case "s":
          marks.push({ type: "strike" });
          break;
        case "u":
          marks.push({ type: "underline" });
          break;
        case "a": {
          const hrefMatch = attrs.match(/href="([^"]*)"/i);
          if (hrefMatch) {
            marks.push({ type: "link", attrs: { href: hrefMatch[1] } });
          }
          break;
        }
      }

      if (marks.length > 0) {
        nodes.push({ type: "text", text: inner, marks });
      } else {
        nodes.push({ type: "text", text: inner });
      }
    }
  }

  if (nodes.length === 0) {
    const text = decodeEntities(cleaned.replace(/<[^>]+>/g, "").trim());
    if (text) nodes.push({ type: "text", text });
  }

  return nodes;
}

function findMatchingClose(html: string, startPos: number, tagName: string): number {
  let depth = 1;
  let pos = startPos;
  const openPattern = new RegExp(`<${tagName}[\\s>]`, "i");
  const closePattern = `</${tagName}>`;

  while (pos < html.length && depth > 0) {
    const nextOpen = html.indexOf(`<${tagName}`, pos);
    const nextClose = html.toLowerCase().indexOf(closePattern.toLowerCase(), pos);

    if (nextClose === -1) return html.length;

    if (nextOpen !== -1 && nextOpen < nextClose && openPattern.test(html.slice(nextOpen))) {
      depth++;
      pos = nextOpen + tagName.length + 1;
    } else {
      depth--;
      if (depth === 0) return nextClose;
      pos = nextClose + closePattern.length;
    }
  }

  return html.length;
}

function decodeEntities(text: string): string {
  return text
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    // Typographic quotes and apostrophes
    .replace(/&rsquo;/g, "\u2019")
    .replace(/&lsquo;/g, "\u2018")
    .replace(/&rdquo;/g, "\u201D")
    .replace(/&ldquo;/g, "\u201C")
    // Dashes
    .replace(/&mdash;/g, "\u2014")
    .replace(/&ndash;/g, "\u2013")
    // Arrows
    .replace(/&rarr;/g, "\u2192")
    .replace(/&larr;/g, "\u2190")
    .replace(/&harr;/g, "\u2194")
    .replace(/&rArr;/g, "\u21D2")
    .replace(/&lArr;/g, "\u21D0")
    // Common symbols
    .replace(/&hellip;/g, "\u2026")
    .replace(/&bull;/g, "\u2022")
    .replace(/&trade;/g, "\u2122")
    .replace(/&copy;/g, "\u00A9")
    .replace(/&reg;/g, "\u00AE")
    .replace(/&times;/g, "\u00D7")
    .replace(/&divide;/g, "\u00F7")
    .replace(/&plusmn;/g, "\u00B1")
    .replace(/&deg;/g, "\u00B0")
    .replace(/&micro;/g, "\u00B5")
    .replace(/&frac12;/g, "\u00BD")
    .replace(/&frac14;/g, "\u00BC")
    .replace(/&frac34;/g, "\u00BE")
    // Numeric character references (&#123; or &#x1F4A1;)
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(parseInt(dec, 10)));
}
