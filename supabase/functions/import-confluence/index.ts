import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { env } from "../_shared/env.ts";
import { splitIntoSections, splitJsonIntoSections } from "../_shared/split-sections.ts";
import { analyzeSections, backfillCoverageNotes } from "../_shared/analyze-sections.ts";
import { scopedDeleteByProvider } from "../_shared/scoped-delete.ts";
import { confluenceToJson } from "../_shared/confluence-to-json.ts";
import { tiptapToMarkdown, type TipTapDoc } from "../_shared/tiptap-markdown.ts";

const ANTHROPIC_API_KEY = env("ANTHROPIC_API_KEY");
const CONFLUENCE_CLIENT_ID = env("CONFLUENCE_CLIENT_ID");
const CONFLUENCE_CLIENT_SECRET = env("CONFLUENCE_CLIENT_SECRET");

import { getCorsHeaders } from "../_shared/cors.ts";

// ── Token refresh ───────────────────────────────────────────────────

/** Refresh the Confluence access token using the stored refresh token. */
async function refreshAccessToken(
  refreshToken: string,
  connectionId: string,
  adminClient: ReturnType<typeof createClient>
): Promise<string> {
  const res = await fetch("https://auth.atlassian.com/oauth/token", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      grant_type: "refresh_token",
      client_id: CONFLUENCE_CLIENT_ID,
      client_secret: CONFLUENCE_CLIENT_SECRET,
      refresh_token: refreshToken,
    }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token refresh failed (${res.status}): ${err}`);
  }

  const data = await res.json();

  // Persist new tokens
  await adminClient
    .from("connections")
    .update({
      access_token: data.access_token,
      ...(data.refresh_token ? { refresh_token: data.refresh_token } : {}),
    })
    .eq("id", connectionId);

  return data.access_token;
}

// ── Confluence helpers ──────────────────────────────────────────────

type ConfluenceV2Page = {
  id: string;
  title: string;
  parentId?: string | null;
  position?: number | null;
  body?: { storage?: { value: string; representation?: string } };
  version?: { createdAt?: string };
};

type FetchedPage = {
  id: string;
  title: string;
  parentId: string | null;
  position: number;
  html: string;
  lastModified: string | null;
};

/** Strip HTML tags, converting to plain text. */
function stripTags(html: string): string {
  return html.replace(/<[^>]+>/g, "").trim();
}

/** Convert Confluence storage-format HTML to markdown. */
function htmlToMarkdown(html: string): string {
  let text = html;

  // Strip Confluence tracked-change tags and inline comment markers (keep inner text)
  text = text.replace(/<\/?ins[^>]*>/gi, "");
  text = text.replace(/<\/?del[^>]*>/gi, "");
  text = text.replace(/<\/?ac:inline-comment-marker[^>]*>/gi, "");

  // Convert headings
  text = text.replace(/<h1[^>]*>([\s\S]*?)<\/h1>/gi, "# $1\n\n");
  text = text.replace(/<h2[^>]*>([\s\S]*?)<\/h2>/gi, "## $1\n\n");
  text = text.replace(/<h3[^>]*>([\s\S]*?)<\/h3>/gi, "### $1\n\n");
  text = text.replace(/<h4[^>]*>([\s\S]*?)<\/h4>/gi, "#### $1\n\n");

  // Convert lists
  text = text.replace(/<li[^>]*>([\s\S]*?)<\/li>/gi, "- $1\n");
  text = text.replace(/<\/?[ou]l[^>]*>/gi, "\n");

  // Convert paragraphs and line breaks
  text = text.replace(/<br\s*\/?>/gi, "\n");
  text = text.replace(/<p[^>]*>([\s\S]*?)<\/p>/gi, "$1\n\n");

  // Convert bold / italic
  text = text.replace(/<strong[^>]*>([\s\S]*?)<\/strong>/gi, "**$1**");
  text = text.replace(/<em[^>]*>([\s\S]*?)<\/em>/gi, "*$1*");

  // Convert links
  text = text.replace(/<a[^>]+href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/gi, "[$2]($1)");

  // Convert code blocks (Confluence structured macros)
  text = text.replace(
    /<ac:structured-macro[^>]*ac:name="code"[^>]*>[\s\S]*?<ac:plain-text-body><!\[CDATA\[([\s\S]*?)\]\]><\/ac:plain-text-body>[\s\S]*?<\/ac:structured-macro>/gi,
    "```\n$1\n```\n\n"
  );

  // Convert tables to proper markdown tables
  text = text.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_match, tableHtml: string) => {
    const rows: string[][] = [];
    // Match rows — use a non-greedy approach that handles nested tags
    const rowParts = tableHtml.split(/<tr[^>]*>/i).slice(1);

    for (const rowChunk of rowParts) {
      const rowHtml = rowChunk.split(/<\/tr>/i)[0] ?? "";
      const cells: string[] = [];
      // Split by cell opening tags, take content before closing tag
      const cellParts = rowHtml.split(/<(?:th|td)[^>]*>/i).slice(1);
      for (const cellChunk of cellParts) {
        const cellContent = cellChunk.split(/<\/(?:th|td)>/i)[0] ?? "";
        cells.push(stripTags(cellContent).replace(/\|/g, "\\|").replace(/\n/g, " "));
      }
      if (cells.length > 0) rows.push(cells);
    }

    if (rows.length === 0) return "";

    const colCount = Math.max(...rows.map((r) => r.length));
    const padded = rows.map((r) => {
      while (r.length < colCount) r.push("");
      return r;
    });

    const fmt = (row: string[]) => "| " + row.join(" | ") + " |";
    const lines: string[] = [];
    lines.push(fmt(padded[0]));
    lines.push("| " + padded[0].map(() => "---").join(" | ") + " |");
    for (const row of padded.slice(1)) {
      lines.push(fmt(row));
    }

    return "\n\n" + lines.join("\n") + "\n\n";
  });

  // Strip all remaining tags
  text = text.replace(/<[^>]+>/g, "");

  // Decode HTML entities
  text = text.replace(/&amp;/g, "&");
  text = text.replace(/&lt;/g, "<");
  text = text.replace(/&gt;/g, ">");
  text = text.replace(/&quot;/g, '"');
  text = text.replace(/&#39;/g, "'");
  text = text.replace(/&nbsp;/g, " ");
  text = text.replace(/&rsquo;/g, "\u2019");
  text = text.replace(/&lsquo;/g, "\u2018");
  text = text.replace(/&rdquo;/g, "\u201D");
  text = text.replace(/&ldquo;/g, "\u201C");
  text = text.replace(/&mdash;/g, "\u2014");
  text = text.replace(/&ndash;/g, "\u2013");
  text = text.replace(/&rarr;/g, "\u2192");
  text = text.replace(/&larr;/g, "\u2190");
  text = text.replace(/&hellip;/g, "\u2026");
  text = text.replace(/&bull;/g, "\u2022");
  text = text.replace(/&trade;/g, "\u2122");
  text = text.replace(/&copy;/g, "\u00A9");
  text = text.replace(/&reg;/g, "\u00AE");
  text = text.replace(/&#x([0-9a-fA-F]+);/g, (_: string, hex: string) => String.fromCodePoint(parseInt(hex, 16)));
  text = text.replace(/&#(\d+);/g, (_: string, dec: string) => String.fromCodePoint(parseInt(dec, 10)));

  // Clean up extra whitespace
  text = text.replace(/\n{3,}/g, "\n\n");
  return text.trim();
}

// ── Tree helpers ────────────────────────────────────────────────────

type TreeNode = FetchedPage & { depth: number };

/** Sort pages in depth-first tree order, preserving Confluence position within siblings. */
function sortPagesAsTree(pages: FetchedPage[]): TreeNode[] {
  const idSet = new Set(pages.map((p) => p.id));
  const byParent = new Map<string | null, FetchedPage[]>();

  for (const p of pages) {
    // If parentId is outside our set, treat as root
    const key = p.parentId && idSet.has(p.parentId) ? p.parentId : null;
    const list = byParent.get(key) ?? [];
    list.push(p);
    byParent.set(key, list);
  }

  // Sort siblings by position
  for (const [, list] of byParent) {
    list.sort((a, b) => a.position - b.position);
  }

  const result: TreeNode[] = [];
  function walk(parentId: string | null, depth: number) {
    for (const p of byParent.get(parentId) ?? []) {
      result.push({ ...p, depth });
      walk(p.id, depth + 1);
    }
  }
  walk(null, 0);

  return result;
}

// ── Fetch helpers ───────────────────────────────────────────────────

/** Fetch specific pages by their IDs (with body + hierarchy info). */
async function fetchConfluencePagesByIds(
  cloudId: string,
  token: string,
  pageIds: string[]
): Promise<FetchedPage[]> {
  const pages: FetchedPage[] = [];

  for (const id of pageIds) {
    const url = `https://api.atlassian.com/ex/confluence/${cloudId}/wiki/api/v2/pages/${id}?body-format=storage`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });

    if (!res.ok) {
      console.error(`Failed to fetch page ${id}: ${await res.text()}`);
      continue;
    }

    const p: ConfluenceV2Page = await res.json();
    pages.push({
      id: p.id,
      title: p.title,
      parentId: p.parentId ?? null,
      position: p.position ?? 0,
      html: p.body?.storage?.value ?? "",
      lastModified: p.version?.createdAt?.split("T")[0] ?? null,
    });
  }

  return pages;
}

/** Fetch all pages from a Confluence Cloud instance. */
async function fetchAllConfluencePages(
  cloudId: string,
  token: string
): Promise<FetchedPage[]> {
  const pages: FetchedPage[] = [];
  let cursor: string | undefined;
  const limit = 25;

  do {
    const params = new URLSearchParams({
      "body-format": "storage",
      limit: String(limit),
      status: "current",
    });
    if (cursor) params.set("cursor", cursor);

    const url = `https://api.atlassian.com/ex/confluence/${cloudId}/wiki/api/v2/pages?${params}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
    });

    if (!res.ok) {
      throw new Error(`Confluence API error (${res.status}): ${await res.text()}`);
    }

    const data = await res.json();
    for (const p of (data.results ?? []) as ConfluenceV2Page[]) {
      pages.push({
        id: p.id,
        title: p.title,
        parentId: p.parentId ?? null,
        position: p.position ?? 0,
        html: p.body?.storage?.value ?? "",
        lastModified: (p as ConfluenceV2Page).version?.createdAt?.split("T")[0] ?? null,
      });
    }

    cursor = data._links?.next
      ? new URL(data._links.next, "https://api.atlassian.com").searchParams.get("cursor") ?? undefined
      : undefined;

    if (pages.length >= 200) break;
  } while (cursor);

  return pages;
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

    // Look up the Confluence connection
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const { data: connection, error: connError } = await adminClient
      .from("connections")
      .select("*")
      .eq("provider", "confluence")
      .eq("connected_by", user.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (connError || !connection) {
      return new Response(
        JSON.stringify({ error: "No Confluence connection found. Please connect Confluence first." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cloudId = connection.workspace_id;

    if (!cloudId) {
      return new Response(
        JSON.stringify({ error: "No Confluence cloud ID found. Please reconnect Confluence." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Refresh the access token before making API calls
    let confluenceToken = connection.access_token;
    if (connection.refresh_token) {
      try {
        confluenceToken = await refreshAccessToken(
          connection.refresh_token,
          connection.id,
          adminClient
        );
      } catch (err) {
        console.error("Token refresh failed, trying existing token:", err);
      }
    }

    // Parse optional pageIds from request body
    let pageIds: string[] | undefined;
    try {
      const body = await req.json();
      if (Array.isArray(body.pageIds) && body.pageIds.length > 0) {
        pageIds = body.pageIds;
      }
    } catch {
      // No body or invalid JSON
    }

    // If no pageIds provided, re-use the ones from the last successful confluence import
    if (!pageIds) {
      const { data: lastImport } = await adminClient
        .from("imports")
        .select("metadata")
        .eq("provider", "confluence")
        .eq("status", "completed")
        .eq("started_by", user.id)
        .order("completed_at", { ascending: false })
        .limit(1)
        .single();

      const savedIds = (lastImport?.metadata as Record<string, unknown>)?.pageIds;
      if (Array.isArray(savedIds) && savedIds.length > 0) {
        pageIds = savedIds as string[];
      }
    }

    // Create import record
    const { data: importRecord, error: importError } = await supabase
      .from("imports")
      .insert({
        provider: "confluence",
        status: "processing",
        started_by: user.id,
      })
      .select()
      .single();

    if (importError) throw importError;

    // Fetch pages from Confluence
    const rawPages = pageIds
      ? await fetchConfluencePagesByIds(cloudId, confluenceToken, pageIds)
      : await fetchAllConfluencePages(cloudId, confluenceToken);

    if (rawPages.length === 0) {
      await adminClient
        .from("imports")
        .update({ status: "failed", error: "No pages found in connected Confluence space" })
        .eq("id", importRecord.id);

      return new Response(
        JSON.stringify({ error: "No pages found in your Confluence space" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Sort pages into tree order (parent → children, respecting position)
    const orderedPages = sortPagesAsTree(rawPages);

    // Convert each page's HTML to JSON and split by headings into sections
    type ParsedSection = {
      title: string;
      content: string;
      contentJson: TipTapDoc;
      sourcePageId: string;
      lastModified: string | null;
      depth: number;
    };
    const allSections: ParsedSection[] = [];

    for (const page of orderedPages) {
      if (!page.html.trim()) continue;

      // Convert Confluence HTML → TipTap JSON directly
      const pageJson = confluenceToJson(page.html);
      const jsonSections = splitJsonIntoSections(pageJson, page.title);

      if (jsonSections.length === 0) continue;

      if (jsonSections.length === 1 && jsonSections[0].title === page.title) {
        allSections.push({
          title: page.title,
          content: jsonSections[0].content,
          contentJson: jsonSections[0].contentJson,
          sourcePageId: page.id,
          lastModified: page.lastModified,
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
            lastModified: page.lastModified,
            depth: isFirst ? page.depth : page.depth + 1,
          });
        }
      }
    }

    if (allSections.length === 0) {
      await adminClient
        .from("imports")
        .update({ status: "failed", error: "All Confluence pages were empty" })
        .eq("id", importRecord.id);

      return new Response(
        JSON.stringify({ error: "No content found in Confluence pages" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Clear existing Confluence sections only (preserves other sources)
    await scopedDeleteByProvider(adminClient, user.id, "confluence");

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
          last_updated: sec.lastModified ?? fallbackDate,
          source_page_id: sec.sourcePageId,
          depth: sec.depth,
          provider: "confluence",
        })
        .select("id")
        .single();

      if (!insertedSection) continue;
      insertedSections.push({
        id: insertedSection.id,
        title: sec.title,
        content: sec.content,
        lastModified: sec.lastModified,
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
          pageIds: rawPages.map((p) => p.id),
          pages_found: rawPages.length,
          sections_created: allSections.length,
        },
      })
      .eq("id", importRecord.id);

    return new Response(
      JSON.stringify({
        importId: importRecord.id,
        pagesFound: rawPages.length,
        sectionsCreated: allSections.length,
        status: "completed",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Confluence import error:", error);
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
