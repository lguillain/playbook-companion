import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getSkillsPromptBlock, ALL_SKILL_IDS } from "../_shared/skills.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
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

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { provider, content, pdfBase64, mediaType } = await req.json();

    // Create import record
    const { data: importRecord, error: importError } = await supabase
      .from("imports")
      .insert({
        provider,
        status: "processing",
        started_by: user.id,
      })
      .select()
      .single();

    if (importError) throw importError;

    const skillsBlock = getSkillsPromptBlock();

    // Build the content block for Claude: PDF as document, text as-is
    const userContent: unknown[] = [];
    if (pdfBase64) {
      userContent.push({
        type: "document",
        source: {
          type: "base64",
          media_type: mediaType || "application/pdf",
          data: pdfBase64,
        },
      });
    }
    userContent.push({
      type: "text",
      text: pdfBase64
        ? "Transcribe and analyze this playbook."
        : `Transcribe and analyze this playbook:\n\n${content}`,
    });

    // Send to Claude for faithful markdown transcription + skill mapping
    const analysisResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 16384,
        system: `You are a sales playbook analyzer. Given playbook content, you must:

1. Faithfully transcribe the content into well-structured markdown. Use # headings for each logical section. Preserve the original wording — do NOT summarize, rewrite, or omit content.
2. Map each section to the relevant skills from the EXACT list below using their IDs.
3. Assess every skill's coverage: "covered" (well-documented), "partial" (mentioned but incomplete), "missing" (not found in the playbook).

SKILLS FRAMEWORK (use ONLY these skill IDs):

${skillsBlock}

RULES:
- Use ONLY skill IDs from the list above (e.g. "i1", "m2", "dm3"). Do not invent new IDs.
- Every skill must appear in skillAssessments with a status.
- Each skill should be mapped to at most ONE section (the most relevant one).
- In the markdown field, use # (h1) for each top-level section heading. Use ## and ### for subsections if needed.
- The "title" in each sections entry must exactly match the corresponding # heading in the markdown.
- Return ONLY valid JSON, no other text.

Return this JSON structure:
{
  "markdown": "# Section Title\\n\\nOriginal content here...\\n\\n# Another Section\\n\\n...",
  "sections": [
    { "title": "Section Title", "skillIds": ["i1", "i2"] }
  ],
  "skillAssessments": [
    { "id": "i1", "status": "covered" },
    { "id": "i2", "status": "partial" }
  ]
}`,
        messages: [{ role: "user", content: userContent }],
      }),
    });

    if (!analysisResponse.ok) {
      const errBody = await analysisResponse.text();
      console.error("Claude API response:", errBody);
      throw new Error(`Claude API error: ${analysisResponse.status} – ${errBody}`);
    }

    const analysisData = await analysisResponse.json();
    const analysisText = analysisData.content[0].text;

    // Extract JSON from response
    const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Failed to parse analysis response");

    let analysis: {
      markdown: string;
      sections: { title: string; skillIds: string[] }[];
      skillAssessments: { id: string; status: string }[];
    };

    try {
      analysis = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      console.error("JSON parse failed, attempting recovery...");
      let fixedJson = jsonMatch[0];
      fixedJson = fixedJson.replace(/,\s*[^,\[\]{}]*$/, "");
      const opens = (fixedJson.match(/\[/g) || []).length - (fixedJson.match(/\]/g) || []).length;
      const braces = (fixedJson.match(/\{/g) || []).length - (fixedJson.match(/\}/g) || []).length;
      for (let i = 0; i < opens; i++) fixedJson += "]";
      for (let i = 0; i < braces; i++) fixedJson += "}";
      try {
        analysis = JSON.parse(fixedJson);
        console.log("Recovered truncated JSON successfully");
      } catch {
        throw new Error(`Failed to parse Claude analysis: ${(parseErr as Error).message}`);
      }
    }

    // Split markdown into sections by # headings (programmatic, not Claude)
    const splitSections: { title: string; content: string }[] = [];
    const lines = analysis.markdown.split("\n");
    let currentTitle = "";
    let currentLines: string[] = [];

    for (const line of lines) {
      const headingMatch = line.match(/^# (.+)/);
      if (headingMatch) {
        // Save previous section if any
        if (currentTitle) {
          splitSections.push({
            title: currentTitle,
            content: currentLines.join("\n").trim(),
          });
        }
        currentTitle = headingMatch[1].trim();
        currentLines = [];
      } else {
        currentLines.push(line);
      }
    }
    // Push last section
    if (currentTitle) {
      splitSections.push({
        title: currentTitle,
        content: currentLines.join("\n").trim(),
      });
    }

    // Build a lookup from section title → skillIds
    const skillsByTitle = new Map<string, string[]>();
    for (const s of analysis.sections) {
      skillsByTitle.set(s.title, s.skillIds ?? []);
    }

    // Use service role for bulk writes
    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

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

    const today = new Date().toISOString().split("T")[0];

    // Insert sections from programmatic split
    for (let i = 0; i < splitSections.length; i++) {
      const section = splitSections[i];

      const { data: insertedSection } = await adminClient
        .from("playbook_sections")
        .insert({
          user_id: user.id,
          title: section.title,
          content: section.content,
          sort_order: i + 1,
          last_updated: today,
        })
        .select("id")
        .single();

      if (!insertedSection) continue;
      const sectionId = insertedSection.id;

      // Match skills by title from Claude's mapping
      const skillIds = skillsByTitle.get(section.title) ?? [];
      const validSkillIds = skillIds.filter((id) => ALL_SKILL_IDS.has(id));
      for (const skillId of validSkillIds) {
        await adminClient
          .from("section_skills")
          .insert({ section_id: sectionId, skill_id: skillId, user_id: user.id });

        await adminClient
          .from("user_skills")
          .update({ section_title: section.title })
          .eq("user_id", user.id)
          .eq("skill_id", skillId);
      }
    }

    // Update skill statuses from assessments
    if (analysis.skillAssessments) {
      for (const assessment of analysis.skillAssessments) {
        if (!ALL_SKILL_IDS.has(assessment.id)) continue;
        const status = ["covered", "partial", "missing"].includes(assessment.status)
          ? assessment.status
          : "missing";

        await adminClient
          .from("user_skills")
          .update({
            status,
            last_updated: status !== "missing" ? today : null,
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
        metadata: { sections_created: splitSections.length },
      })
      .eq("id", importRecord.id);

    return new Response(
      JSON.stringify({
        importId: importRecord.id,
        sectionsCreated: splitSections.length,
        status: "completed",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Import error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
