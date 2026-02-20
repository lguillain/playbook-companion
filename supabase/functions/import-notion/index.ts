import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { env } from "../_shared/env.ts";
import { splitIntoSections, splitJsonIntoSections } from "../_shared/split-sections.ts";
import { analyzeSections, backfillCoverageNotes } from "../_shared/analyze-sections.ts";
import { scopedDeleteByProvider } from "../_shared/scoped-delete.ts";
import { notionToJson } from "../_shared/notion-to-json.ts";
import { tiptapToMarkdown, type TipTapDoc } from "../_shared/tiptap-markdown.ts";

const ANTHROPIC_API_KEY = env("ANTHROPIC_API_KEY");
const NOTION_API_VERSION = "2022-06-28";

import { getCorsHeaders } from "../_shared/cors.ts";

// ── Notion helpers ──────────────────────────────────────────────────

type NotionBlock = {
  type: string;
  [key: string]: unknown;
};

/** Extract plain text from a single rich-text array. */
function richTextToPlain(richText: Array<{ plain_text: string }>): string {
  return richText.map((t) => t.plain_text).join("");
}

/** Convert a list of Notion blocks into markdown-ish text. */
function blocksToMarkdown(blocks: NotionBlock[]): string {
  const lines: string[] = [];

  for (const block of blocks) {
    const b = block as Record<string, any>;
    switch (block.type) {
      case "paragraph":
        lines.push(richTextToPlain(b.paragraph.rich_text));
        break;
      case "heading_1":
        lines.push(`# ${richTextToPlain(b.heading_1.rich_text)}`);
        break;
      case "heading_2":
        lines.push(`## ${richTextToPlain(b.heading_2.rich_text)}`);
        break;
      case "heading_3":
        lines.push(`### ${richTextToPlain(b.heading_3.rich_text)}`);
        break;
      case "bulleted_list_item":
        lines.push(`- ${richTextToPlain(b.bulleted_list_item.rich_text)}`);
        break;
      case "numbered_list_item":
        lines.push(`1. ${richTextToPlain(b.numbered_list_item.rich_text)}`);
        break;
      case "to_do":
        lines.push(
          `- [${b.to_do.checked ? "x" : " "}] ${richTextToPlain(b.to_do.rich_text)}`
        );
        break;
      case "toggle":
        lines.push(`> ${richTextToPlain(b.toggle.rich_text)}`);
        break;
      case "quote":
        lines.push(`> ${richTextToPlain(b.quote.rich_text)}`);
        break;
      case "code":
        lines.push(
          `\`\`\`\n${richTextToPlain(b.code.rich_text)}\n\`\`\``
        );
        break;
      case "divider":
        lines.push("---");
        break;
      case "callout":
        lines.push(`> ${richTextToPlain(b.callout.rich_text)}`);
        break;
      default:
        break;
    }
  }

  return lines.join("\n\n");
}

/** Fetch all blocks (children) of a Notion page, handling pagination. */
async function fetchAllBlocks(
  pageId: string,
  token: string
): Promise<NotionBlock[]> {
  const blocks: NotionBlock[] = [];
  let cursor: string | undefined;

  do {
    const url = new URL(
      `https://api.notion.com/v1/blocks/${pageId}/children`
    );
    url.searchParams.set("page_size", "100");
    if (cursor) url.searchParams.set("start_cursor", cursor);

    const res = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        "Notion-Version": NOTION_API_VERSION,
      },
    });

    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Notion blocks API error (${res.status}): ${err}`);
    }

    const data = await res.json();
    blocks.push(...data.results);
    cursor = data.has_more ? data.next_cursor : undefined;
  } while (cursor);

  return blocks;
}

type ParsedPage = {
  id: string;
  title: string;
  parentId: string | null;
  markdown: string;
  contentJson: TipTapDoc;
  lastEdited: string | null;
};

/** Search for pages the integration can access and fetch their content. */
async function fetchNotionPages(
  token: string
): Promise<ParsedPage[]> {
  const res = await fetch("https://api.notion.com/v1/search", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Notion-Version": NOTION_API_VERSION,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      filter: { value: "page", property: "object" },
      page_size: 50,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Notion search API error (${res.status}): ${err}`);
  }

  const data = await res.json();

  const pages: ParsedPage[] = [];

  for (const page of data.results) {
    const titleProp = page.properties?.title ?? page.properties?.Name;
    const title = titleProp?.title
      ? richTextToPlain(titleProp.title)
      : "Untitled";
    const lastEdited = page.last_edited_time
      ? page.last_edited_time.split("T")[0]
      : null;
    // Track parent page ID for tree building
    const parentId = page.parent?.type === "page_id" ? page.parent.page_id : null;

    try {
      const blocks = await fetchAllBlocks(page.id, token);
      const markdown = blocksToMarkdown(blocks);
      // Convert blocks directly to TipTap JSON (no markdown intermediate)
      const contentJson = notionToJson(blocks);
      if (markdown.trim()) {
        pages.push({ id: page.id, title, parentId, markdown, contentJson, lastEdited });
      }
    } catch (err) {
      console.error(`Failed to fetch blocks for page ${page.id}:`, err);
    }
  }

  return pages;
}

// ── Tree helpers ────────────────────────────────────────────────────

type TreePage = ParsedPage & { depth: number };

/** Sort pages in depth-first tree order using parentId. */
function sortPagesAsTree(pages: ParsedPage[]): TreePage[] {
  const idSet = new Set(pages.map((p) => p.id));
  const byParent = new Map<string | null, ParsedPage[]>();

  for (const p of pages) {
    const key = p.parentId && idSet.has(p.parentId) ? p.parentId : null;
    const list = byParent.get(key) ?? [];
    list.push(p);
    byParent.set(key, list);
  }

  const result: TreePage[] = [];
  function walk(parentId: string | null, depth: number) {
    for (const p of byParent.get(parentId) ?? []) {
      result.push({ ...p, depth });
      walk(p.id, depth + 1);
    }
  }
  walk(null, 0);

  return result;
}

// ── Main handler ────────────────────────────────────────────────────

Deno.serve(async (req) => {
  const corsHeaders = getCorsHeaders(req);
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Authenticate the caller
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: authHeader } } }
    );

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Look up the Notion connection
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: connection, error: connError } = await adminClient
      .from("connections")
      .select("*")
      .eq("provider", "notion")
      .eq("connected_by", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (connError || !connection) {
      return new Response(
        JSON.stringify({ error: "No Notion connection found. Please connect Notion first." }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const notionToken = connection.access_token;

    // Create import record
    const { data: importRecord, error: importError } = await supabase
      .from("imports")
      .insert({
        provider: "notion",
        status: "processing",
        started_by: user.id,
      })
      .select()
      .single();

    if (importError) throw importError;

    // Fetch pages from Notion (with content)
    const parsedPages = await fetchNotionPages(notionToken);

    if (parsedPages.length === 0) {
      await adminClient
        .from("imports")
        .update({ status: "failed", error: "No pages found in connected Notion workspace" })
        .eq("id", importRecord.id);

      return new Response(
        JSON.stringify({ error: "No pages found in your Notion workspace" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Sort pages into tree order (parent → children)
    const orderedPages = sortPagesAsTree(parsedPages);

    // Split each page's JSON by headings into finer-grained sections
    type ParsedSection = {
      title: string;
      content: string;
      contentJson: TipTapDoc;
      sourcePageId: string;
      lastEdited: string | null;
      depth: number;
    };
    const allSections: ParsedSection[] = [];

    for (const page of orderedPages) {
      // Use JSON-aware splitting (preserves structure)
      const jsonSections = splitJsonIntoSections(page.contentJson, page.title);

      if (jsonSections.length === 0) continue;

      if (jsonSections.length === 1 && jsonSections[0].title === page.title) {
        allSections.push({
          title: page.title,
          content: jsonSections[0].content,
          contentJson: jsonSections[0].contentJson,
          sourcePageId: page.id,
          lastEdited: page.lastEdited,
          depth: page.depth,
        });
      } else {
        for (let j = 0; j < jsonSections.length; j++) {
          const sec = jsonSections[j];
          const isFirst = j === 0;
          allSections.push({
            title: isFirst ? page.title : sec.title,
            content: sec.content,
            contentJson: sec.contentJson,
            sourcePageId: page.id,
            lastEdited: page.lastEdited,
            depth: isFirst ? page.depth : page.depth + 1,
          });
        }
      }
    }

    // Clear existing Notion sections only (preserves other sources)
    await scopedDeleteByProvider(adminClient, user.id, "notion");

    // Determine sort_order offset so new sections come after existing ones
    const { data: maxRow } = await adminClient
      .from("playbook_sections")
      .select("sort_order")
      .eq("user_id", user.id)
      .order("sort_order", { ascending: false })
      .limit(1)
      .single();
    const sortOffset = maxRow?.sort_order ?? 0;

    const fallbackDate = new Date().toISOString().split("T")[0];

    // Insert each heading-level section, storing source page ID
    const insertedSections: { id: string; title: string; content: string; lastModified?: string | null }[] = [];

    for (let i = 0; i < allSections.length; i++) {
      const sec = allSections[i];

      const { data: insertedSection } = await adminClient
        .from("playbook_sections")
        .insert({
          user_id: user.id,
          title: sec.title,
          content: sec.content,
          content_json: sec.contentJson,
          sort_order: sortOffset + i + 1,
          last_updated: sec.lastEdited ?? fallbackDate,
          source_page_id: sec.sourcePageId,
          depth: sec.depth,
          provider: "notion",
        })
        .select("id")
        .single();

      if (!insertedSection) continue;
      insertedSections.push({
        id: insertedSection.id,
        title: sec.title,
        content: sec.content,
        lastModified: sec.lastEdited,
      });
    }

    // Fetch ALL user sections (across all providers) for skill analysis
    const { data: allUserSections } = await adminClient
      .from("playbook_sections")
      .select("id, title, content, content_json, last_updated")
      .eq("user_id", user.id)
      .order("sort_order");

    const sectionsForAnalysis = (allUserSections ?? []).map((s: any) => ({
      id: s.id,
      title: s.title,
      // Prefer JSON → markdown for analysis (higher fidelity), fall back to stored markdown
      content: s.content_json
        ? tiptapToMarkdown(s.content_json as TipTapDoc).trim()
        : s.content,
      lastModified: s.last_updated,
    }));

    // Analyze ALL sections for skill coverage (so skills from other providers aren't lost)
    await analyzeSections(
      sectionsForAnalysis,
      adminClient,
      user.id,
      ANTHROPIC_API_KEY!,
    );

    try {
      await backfillCoverageNotes(adminClient, user.id, ANTHROPIC_API_KEY!);
    } catch (err) {
      console.error("Coverage note backfill failed (non-fatal):", err);
    }

    // Mark import complete
    await adminClient
      .from("imports")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        metadata: {
          pages_found: parsedPages.length,
          sections_created: allSections.length,
        },
      })
      .eq("id", importRecord.id);

    return new Response(
      JSON.stringify({
        importId: importRecord.id,
        pagesFound: parsedPages.length,
        sectionsCreated: allSections.length,
        status: "completed",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Notion import error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
