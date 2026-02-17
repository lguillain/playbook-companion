import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { env } from "../_shared/env.ts";
import { getSkillsPromptBlock, ALL_SKILL_IDS } from "../_shared/skills.ts";

const ANTHROPIC_API_KEY = env("ANTHROPIC_API_KEY");
const CONFLUENCE_CLIENT_ID = env("CONFLUENCE_CLIENT_ID");
const CONFLUENCE_CLIENT_SECRET = env("CONFLUENCE_CLIENT_SECRET");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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

    // Convert each page to markdown
    type ParsedPage = { title: string; markdown: string; depth: number; lastModified: string | null };
    const parsedPages: ParsedPage[] = [];
    for (const page of orderedPages) {
      const markdown = page.html.trim() ? htmlToMarkdown(page.html) : "";
      parsedPages.push({
        title: page.title,
        markdown,
        depth: page.depth,
        lastModified: page.lastModified,
      });
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

    // Build full content for Claude to analyze
    const pagesContent = parsedPages.map((p, i) => {
      const indent = "  ".repeat(p.depth);
      return `[Page ${i}] ${indent}"${p.title}"\n${p.markdown}`;
    }).join("\n\n---\n\n");

    const skillsBlock = getSkillsPromptBlock();

    // Send full content to Claude for accurate skill mapping & coverage assessment
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
          system: `You are a sales playbook analyzer. Given the full content of playbook pages, you must:
1. Map each page (by its index) to the relevant skills from the EXACT list below.
2. Assess every skill's coverage based on the ACTUAL CONTENT (not just titles):
   - "covered": the page contains substantive, actionable content for that skill (specific guidance, examples, frameworks, or detailed methodology)
   - "partial": the page mentions the topic but lacks depth — e.g. a heading with only a few bullet points, vague guidance, or a brief mention without actionable detail
   - "missing": no page meaningfully addresses this skill

SKILLS FRAMEWORK (use ONLY these skill IDs):

${skillsBlock}

RULES:
- Use ONLY skill IDs from the list above (e.g. "i1", "m2", "dm3"). Do not invent new IDs.
- Every skill must appear in skillAssessments with a status.
- Every skill that is "covered" or "partial" MUST appear in pageSkills mapped to the most relevant page. Only "missing" skills should have no page mapping.
- Each skill should be mapped to at most ONE page (the most relevant one).
- Be honest about coverage — a short or vague section is "partial", not "covered".
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
              content: `Analyze these ${parsedPages.length} playbook pages from Confluence:\n\n${pagesContent}`,
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

    // Clear existing data for THIS USER
    await adminClient.from("section_skills").delete().eq("user_id", user.id);
    await adminClient.from("staged_edits").delete().eq("created_by", user.id);
    await adminClient.from("chat_messages").delete().eq("created_by", user.id);
    await adminClient.from("playbook_sections").delete().eq("user_id", user.id);

    // Reset all user_skills to "missing" for this user
    await adminClient
      .from("user_skills")
      .update({ status: "missing", last_updated: null, section_title: null })
      .eq("user_id", user.id);

    const fallbackDate = new Date().toISOString().split("T")[0];

    // Insert each page as a section, preserving tree order
    const mappedSkillIds = new Set<string>();
    const insertedSections: { id: string; title: string; pageIndex: number }[] = [];

    for (let i = 0; i < parsedPages.length; i++) {
      const page = parsedPages[i];

      // Indent subpage titles to show hierarchy
      const titlePrefix = page.depth > 0 ? "\u00A0\u00A0".repeat(page.depth) : "";
      const displayTitle = `${titlePrefix}${page.title}`;

      const { data: insertedSection } = await adminClient
        .from("playbook_sections")
        .insert({
          user_id: user.id,
          title: displayTitle,
          content: page.markdown,
          sort_order: i + 1,
          last_updated: page.lastModified ?? fallbackDate,
        })
        .select("id")
        .single();

      if (!insertedSection) continue;
      const sectionId = insertedSection.id;
      insertedSections.push({ id: sectionId, title: displayTitle, pageIndex: i });

      const skillIds = pageSkillMap.get(i) ?? [];
      for (const skillId of skillIds) {
        mappedSkillIds.add(skillId);
        await adminClient
          .from("section_skills")
          .insert({ section_id: sectionId, skill_id: skillId, user_id: user.id });

        await adminClient
          .from("user_skills")
          .update({ section_title: displayTitle })
          .eq("user_id", user.id)
          .eq("skill_id", skillId);
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
    // Safety net: if a skill is covered/partial but wasn't mapped to a page,
    // link it to the first section so it's discoverable in the playbook tab
    if (analysis.skillAssessments) {
      for (const assessment of analysis.skillAssessments) {
        if (!ALL_SKILL_IDS.has(assessment.id)) continue;
        const status = ["covered", "partial", "missing"].includes(assessment.status)
          ? assessment.status
          : "missing";

        // Link orphaned non-missing skills to the first section
        if (status !== "missing" && !mappedSkillIds.has(assessment.id) && insertedSections.length > 0) {
          const fallbackSection = insertedSections[0];
          await adminClient
            .from("section_skills")
            .insert({ section_id: fallbackSection.id, skill_id: assessment.id, user_id: user.id });
          await adminClient
            .from("user_skills")
            .update({ section_title: fallbackSection.title })
            .eq("user_id", user.id)
            .eq("skill_id", assessment.id);
        }

        const skillDate = skillDateMap.get(assessment.id) ?? fallbackDate;
        await adminClient
          .from("user_skills")
          .update({
            status,
            last_updated: status !== "missing" ? skillDate : null,
          })
          .eq("user_id", user.id)
          .eq("skill_id", assessment.id);
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
