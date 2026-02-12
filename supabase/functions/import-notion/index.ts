import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { env } from "../_shared/env.ts";

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

/** Search for pages the integration can access. */
async function searchPages(
  token: string
): Promise<Array<{ id: string; title: string; lastEdited: string | null }>> {
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

  return data.results.map((page: Record<string, any>) => {
    const titleProp = page.properties?.title ?? page.properties?.Name;
    const title = titleProp?.title
      ? richTextToPlain(titleProp.title)
      : "Untitled";
    const lastEdited = page.last_edited_time
      ? page.last_edited_time.split("T")[0]
      : null;
    return { id: page.id, title, lastEdited };
  });
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

    // Fetch pages from Notion
    const pages = await searchPages(notionToken);

    if (pages.length === 0) {
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

    // Fetch content from each page and combine
    const pageContents: string[] = [];
    for (const page of pages) {
      try {
        const blocks = await fetchAllBlocks(page.id, notionToken);
        const markdown = blocksToMarkdown(blocks);
        if (markdown.trim()) {
          pageContents.push(`# ${page.title}\n\n${markdown}`);
        }
      } catch (err) {
        console.error(`Failed to fetch blocks for page ${page.id}:`, err);
      }
    }

    const combinedContent = pageContents.join("\n\n---\n\n");

    if (!combinedContent.trim()) {
      await adminClient
        .from("imports")
        .update({ status: "failed", error: "All Notion pages were empty" })
        .eq("id", importRecord.id);

      return new Response(
        JSON.stringify({ error: "No content found in Notion pages" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Analyze with Claude (same prompt as the PDF import function)
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
          system: `You are a sales playbook analyzer. Given raw playbook content, you must:
1. Split it into logical sections (ICP, Qualification, Demo, Objections, Process, etc.)
2. Map each section to relevant sales skills from this framework:
   - ICP & Problem Landscape
   - Value Proposition & Messaging
   - Sales Vocabulary & Buyer Language
   - Qualification & Risk Assessment
   - Sales Process & Meeting Sequences
   - Discovery & Customer-Centric Questioning
   - Demo & Solution Fit
   - Objection & Pricing Handling
   - Tools, Tech Stack & Usage
   - Opportunity Management & Deal Control
3. Assess coverage: "covered" (well-documented), "partial" (mentioned but incomplete), "missing" (not found)

Return valid JSON with this structure:
{
  "sections": [
    { "title": "...", "content": "...", "skills": ["skill_name_1", "skill_name_2"] }
  ],
  "skillAssessments": [
    { "name": "...", "category": "...", "status": "covered|partial|missing" }
  ]
}`,
          messages: [
            {
              role: "user",
              content: `Analyze this playbook content imported from Notion:\n\n${combinedContent}`,
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

    const analysis = JSON.parse(jsonMatch[0]);

    // Use the most recent Notion page edit date, falling back to today
    const sourceDates = pages.map((p) => p.lastEdited).filter(Boolean) as string[];
    const sourceDate = sourceDates.length > 0
      ? sourceDates.sort().pop()!
      : new Date().toISOString().split("T")[0];

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

    // Insert analyzed sections
    for (let i = 0; i < analysis.sections.length; i++) {
      const section = analysis.sections[i];

      await adminClient.from("playbook_sections").insert({
        user_id: user.id,
        title: section.title,
        content: section.content,
        sort_order: i + 1,
        last_updated: sourceDate,
      });
    }

    // Update skill statuses based on analysis (Notion returns skill names, not IDs)
    if (analysis.skillAssessments) {
      for (const assessment of analysis.skillAssessments) {
        // Look up skill ID by name
        const { data: matchedSkills } = await adminClient
          .from("skills")
          .select("id")
          .ilike("name", `%${assessment.name}%`);

        if (matchedSkills && matchedSkills.length > 0) {
          for (const skill of matchedSkills) {
            await adminClient
              .from("user_skills")
              .update({
                status: assessment.status,
                last_updated: sourceDate,
              })
              .eq("user_id", user.id)
              .eq("skill_id", skill.id);
          }
        }
      }
    }

    // Mark import complete
    await adminClient
      .from("imports")
      .update({
        status: "completed",
        completed_at: new Date().toISOString(),
        metadata: {
          pages_found: pages.length,
          pages_with_content: pageContents.length,
          sections_created: analysis.sections.length,
        },
      })
      .eq("id", importRecord.id);

    return new Response(
      JSON.stringify({
        importId: importRecord.id,
        pagesFound: pages.length,
        sectionsCreated: analysis.sections.length,
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
