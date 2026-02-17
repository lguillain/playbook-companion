import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { env } from "../_shared/env.ts";
import { getSkillsPromptBlock, ALL_SKILL_IDS } from "../_shared/skills.ts";
import { splitIntoSections } from "../_shared/split-sections.ts";

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

    // Split each page's markdown by headings into finer-grained sections
    type ParsedSection = {
      title: string;
      content: string;
      sourcePageId: string;
      lastEdited: string | null;
    };
    const allSections: ParsedSection[] = [];

    for (const page of parsedPages) {
      const headingSections = splitIntoSections(page.markdown, page.title);

      if (headingSections.length === 1 && headingSections[0].title === page.title) {
        // Page had no internal headings — keep page title as-is
        allSections.push({
          title: page.title,
          content: headingSections[0].content,
          sourcePageId: page.id,
          lastEdited: page.lastEdited,
        });
      } else {
        for (const sec of headingSections) {
          allSections.push({
            title: `${page.title} > ${sec.title}`,
            content: sec.content,
            sourcePageId: page.id,
            lastEdited: page.lastEdited,
          });
        }
      }
    }

    // Build full content for Claude to analyze
    const sectionsContent = allSections.map((s, i) => {
      return `[Section ${i}] "${s.title}"\n${s.content}`;
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
          system: `You are a sales playbook analyzer. Given the full content of playbook sections, you must:
1. Map each section (by its index) to the relevant skills from the EXACT list below.
2. Assess every skill's coverage based on the ACTUAL CONTENT (not just titles):
   - "covered": the section contains substantive, actionable content for that skill (specific guidance, examples, frameworks, or detailed methodology)
   - "partial": the section mentions the topic but lacks depth — e.g. a heading with only a few bullet points, vague guidance, or a brief mention without actionable detail
   - "missing": no section meaningfully addresses this skill

SKILLS FRAMEWORK (use ONLY these skill IDs):

${skillsBlock}

RULES:
- Use ONLY skill IDs from the list above (e.g. "i1", "m2", "dm3"). Do not invent new IDs.
- Every skill must appear in skillAssessments with a status.
- Every skill that is "covered" or "partial" MUST appear in sectionSkills mapped to the most relevant section. Only "missing" skills should have no section mapping.
- Each skill should be mapped to at most ONE section (the most relevant one).
- Be honest about coverage — a short or vague section is "partial", not "covered".
- Return ONLY valid JSON, no other text.

Return this JSON structure:
{
  "sectionSkills": [
    { "sectionIndex": 0, "skillIds": ["i1", "i2"] },
    { "sectionIndex": 1, "skillIds": ["m1"] }
  ],
  "skillAssessments": [
    { "id": "i1", "status": "covered" },
    { "id": "i2", "status": "partial" }
  ]
}`,
          messages: [
            {
              role: "user",
              content: `Analyze these ${allSections.length} playbook sections from Notion:\n\n${sectionsContent}`,
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
      sectionSkills: { sectionIndex: number; skillIds: string[] }[];
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

    // Build a lookup from sectionIndex → skillIds
    const sectionSkillMap = new Map<number, string[]>();
    for (const ss of analysis.sectionSkills ?? []) {
      sectionSkillMap.set(ss.sectionIndex, (ss.skillIds ?? []).filter((id) => ALL_SKILL_IDS.has(id)));
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

    // Insert each heading-level section, storing source page ID
    const mappedSkillIds = new Set<string>();
    const insertedSections: { id: string; title: string; sectionIndex: number }[] = [];

    for (let i = 0; i < allSections.length; i++) {
      const sec = allSections[i];

      const { data: insertedSection } = await adminClient
        .from("playbook_sections")
        .insert({
          user_id: user.id,
          title: sec.title,
          content: sec.content,
          sort_order: i + 1,
          last_updated: sec.lastEdited ?? fallbackDate,
          source_page_id: sec.sourcePageId,
        })
        .select("id")
        .single();

      if (!insertedSection) continue;
      const sectionId = insertedSection.id;
      insertedSections.push({ id: sectionId, title: sec.title, sectionIndex: i });

      const skillIds = sectionSkillMap.get(i) ?? [];
      for (const skillId of skillIds) {
        mappedSkillIds.add(skillId);
        await adminClient
          .from("section_skills")
          .insert({ section_id: sectionId, skill_id: skillId, user_id: user.id });

        await adminClient
          .from("user_skills")
          .update({ section_title: sec.title })
          .eq("user_id", user.id)
          .eq("skill_id", skillId);
      }
    }

    // Build a skill → source date lookup from the section-skill mapping
    const skillDateMap = new Map<string, string | null>();
    for (const [sectionIndex, skillIds] of sectionSkillMap) {
      const secDate = allSections[sectionIndex]?.lastEdited ?? null;
      for (const skillId of skillIds) {
        skillDateMap.set(skillId, secDate);
      }
    }

    // Update skill statuses from assessments
    // Safety net: if a skill is covered/partial but wasn't mapped to a section,
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
