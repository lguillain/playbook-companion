import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { env } from "../_shared/env.ts";
import { getSkillsPromptBlock, ALL_SKILL_IDS } from "../_shared/skills.ts";

const ANTHROPIC_API_KEY = env("ANTHROPIC_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (connError || !connection) {
      return new Response(
        JSON.stringify({ error: "No Confluence connection found. Please connect Confluence first." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const confluenceToken = connection.access_token;
    const cloudId = connection.workspace_id;

    if (!cloudId) {
      return new Response(
        JSON.stringify({ error: "No Confluence cloud ID found. Please reconnect Confluence." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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

    // Convert each page to markdown
    type ParsedPage = { title: string; markdown: string; depth: number; lastModified: string | null };
    const parsedPages: ParsedPage[] = [];
    for (const page of orderedPages) {
      if (!page.html.trim()) continue;
      const markdown = htmlToMarkdown(page.html);
      if (markdown) {
        parsedPages.push({
          title: page.title,
          markdown,
          depth: page.depth,
          lastModified: page.lastModified,
        });
      }
    }

    if (parsedPages.length === 0) {
      await adminClient
        .from("imports")
        .update({ status: "failed", error: "All Confluence pages were empty" })
        .eq("id", importRecord.id);

      return new Response(
        JSON.stringify({ error: "No content found in Confluence pages" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build a table-of-contents summary for Claude to map skills
    const tocSummary = parsedPages.map((p, i) => {
      const indent = "  ".repeat(p.depth);
      return `[Page ${i + 1}] ${indent}"${p.title}"\n${p.markdown.slice(0, 800)}${p.markdown.length > 800 ? "\n..." : ""}`;
    }).join("\n\n---\n\n");

    const skillsBlock = getSkillsPromptBlock();

    // Ask Claude only for skill mapping (lightweight — no content reproduction)
    const analysisResponse = await fetch(
      "https://api.anthropic.com/v1/messages",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY!,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-5-20250929",
          max_tokens: 4096,
          system: `You are a sales playbook analyzer. Given page summaries from a playbook, you must:
1. Map each page (by its index) to the relevant skills from the EXACT list below.
2. Assess every skill's coverage: "covered" (well-documented), "partial" (mentioned but incomplete), "missing" (not found).

SKILLS FRAMEWORK (use ONLY these skill IDs):

${skillsBlock}

RULES:
- Use ONLY skill IDs from the list above (e.g. "i1", "m2", "dm3"). Do not invent new IDs.
- Every skill must appear in skillAssessments with a status.
- Each skill should be mapped to at most ONE page (the most relevant one).
- Return ONLY valid JSON, no other text.

Return this JSON structure:
{
  "pageSkills": [
    { "pageIndex": 0, "skillIds": ["i1", "i2"] },
    { "pageIndex": 1, "skillIds": ["m1"] }
  ],
  "skillAssessments": [
    { "id": "i1", "status": "covered" },
    { "id": "i2", "status": "partial" }
  ]
}`,
          messages: [
            {
              role: "user",
              content: `Analyze these ${parsedPages.length} playbook pages from Confluence:\n\n${tocSummary}`,
            },
          ],
        }),
      }
    );

    if (!analysisResponse.ok) {
      throw new Error(`Claude API error: ${analysisResponse.status}`);
    }

    const analysisData = await analysisResponse.json();
    const analysisText = analysisData.content[0].text;

    const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Failed to parse analysis response");

    let analysis: {
      pageSkills: { pageIndex: number; skillIds: string[] }[];
      skillAssessments: { id: string; status: string }[];
    };
    try {
      analysis = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      console.error("JSON parse failed. Response length:", analysisText.length);
      let fixedJson = jsonMatch[0];
      fixedJson = fixedJson.replace(/,\s*[^,\[\]{}]*$/, "");
      const opens = (fixedJson.match(/\[/g) || []).length - (fixedJson.match(/\]/g) || []).length;
      const braces = (fixedJson.match(/\{/g) || []).length - (fixedJson.match(/\}/g) || []).length;
      for (let i = 0; i < opens; i++) fixedJson += "]";
      for (let i = 0; i < braces; i++) fixedJson += "}";
      try {
        analysis = JSON.parse(fixedJson);
      } catch {
        throw new Error(`Failed to parse Claude analysis response: ${(parseErr as Error).message}`);
      }
    }

    // Build a lookup from pageIndex → skillIds
    const pageSkillMap = new Map<number, string[]>();
    for (const ps of analysis.pageSkills ?? []) {
      pageSkillMap.set(ps.pageIndex, (ps.skillIds ?? []).filter((id) => ALL_SKILL_IDS.has(id)));
    }

    // Clear existing data before inserting
    await adminClient.from("section_skills").delete().neq("section_id", "");
    await adminClient.from("staged_edits").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await adminClient.from("chat_messages").delete().neq("id", "00000000-0000-0000-0000-000000000000");
    await adminClient.from("playbook_sections").delete().neq("id", "");

    // Reset all skills to "missing"
    await adminClient
      .from("skills")
      .update({ status: "missing", last_updated: null, section_title: null })
      .neq("id", "");

    const fallbackDate = new Date().toISOString().split("T")[0];

    // Insert each page as a section, preserving tree order
    for (let i = 0; i < parsedPages.length; i++) {
      const page = parsedPages[i];
      const sectionId = `confluence-${i + 1}`;

      // Indent subpage titles to show hierarchy
      const titlePrefix = page.depth > 0 ? "\u00A0\u00A0".repeat(page.depth) : "";
      const displayTitle = `${titlePrefix}${page.title}`;

      await adminClient.from("playbook_sections").upsert({
        id: sectionId,
        title: displayTitle,
        content: page.markdown,
        sort_order: i + 1,
        last_updated: page.lastModified ?? fallbackDate,
      });

      const skillIds = pageSkillMap.get(i) ?? [];
      for (const skillId of skillIds) {
        await adminClient
          .from("section_skills")
          .upsert({ section_id: sectionId, skill_id: skillId });

        await adminClient
          .from("skills")
          .update({ section_title: displayTitle })
          .eq("id", skillId);
      }
    }

    // Build a skill → source date lookup from the page-skill mapping
    const skillDateMap = new Map<string, string | null>();
    for (const [pageIndex, skillIds] of pageSkillMap) {
      const pageDate = parsedPages[pageIndex]?.lastModified ?? null;
      for (const skillId of skillIds) {
        skillDateMap.set(skillId, pageDate);
      }
    }

    // Update skill statuses from assessments
    if (analysis.skillAssessments) {
      for (const assessment of analysis.skillAssessments) {
        if (!ALL_SKILL_IDS.has(assessment.id)) continue;
        const status = ["covered", "partial", "missing"].includes(assessment.status)
          ? assessment.status
          : "missing";

        const skillDate = skillDateMap.get(assessment.id) ?? fallbackDate;
        await adminClient
          .from("skills")
          .update({
            status,
            last_updated: status !== "missing" ? skillDate : null,
          })
          .eq("id", assessment.id);
      }
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
          pages_with_content: parsedPages.length,
          sections_created: parsedPages.length,
        },
      })
      .eq("id", importRecord.id);

    return new Response(
      JSON.stringify({
        importId: importRecord.id,
        pagesFound: rawPages.length,
        sectionsCreated: parsedPages.length,
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
