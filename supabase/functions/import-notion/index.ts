import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { env } from "../_shared/env.ts";
import { getSkillsPromptBlock, ALL_SKILL_IDS } from "../_shared/skills.ts";

const ANTHROPIC_API_KEY = env("ANTHROPIC_API_KEY");
const NOTION_API_VERSION = "2022-06-28";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

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
  markdown: string;
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

    try {
      const blocks = await fetchAllBlocks(page.id, token);
      const markdown = blocksToMarkdown(blocks);
      if (markdown.trim()) {
        pages.push({ id: page.id, title, markdown, lastEdited });
      }
    } catch (err) {
      console.error(`Failed to fetch blocks for page ${page.id}:`, err);
    }
  }

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

    // Build a table-of-contents summary for Claude to map skills
    const tocSummary = parsedPages.map((p, i) => {
      return `[Page ${i + 1}] "${p.title}"\n${p.markdown.slice(0, 800)}${p.markdown.length > 800 ? "\n..." : ""}`;
    }).join("\n\n---\n\n");

    const skillsBlock = getSkillsPromptBlock();

    // Ask Claude only for skill mapping (same approach as Confluence import)
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
              content: `Analyze these ${parsedPages.length} playbook pages from Notion:\n\n${tocSummary}`,
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

    // Insert each Notion page as a section, preserving per-page dates
    for (let i = 0; i < parsedPages.length; i++) {
      const page = parsedPages[i];

      const { data: insertedSection } = await adminClient
        .from("playbook_sections")
        .insert({
          user_id: user.id,
          title: page.title,
          content: page.markdown,
          sort_order: i + 1,
          last_updated: page.lastEdited ?? fallbackDate,
        })
        .select("id")
        .single();

      if (!insertedSection) continue;
      const sectionId = insertedSection.id;

      const skillIds = pageSkillMap.get(i) ?? [];
      for (const skillId of skillIds) {
        await adminClient
          .from("section_skills")
          .insert({ section_id: sectionId, skill_id: skillId, user_id: user.id });

        await adminClient
          .from("user_skills")
          .update({ section_title: page.title })
          .eq("user_id", user.id)
          .eq("skill_id", skillId);
      }
    }

    // Build a skill → source date lookup from the page-skill mapping
    const skillDateMap = new Map<string, string | null>();
    for (const [pageIndex, skillIds] of pageSkillMap) {
      const pageDate = parsedPages[pageIndex]?.lastEdited ?? null;
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
          pages_found: parsedPages.length,
          pages_with_content: parsedPages.length,
          sections_created: parsedPages.length,
        },
      })
      .eq("id", importRecord.id);

    return new Response(
      JSON.stringify({
        importId: importRecord.id,
        pagesFound: parsedPages.length,
        sectionsCreated: parsedPages.length,
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
