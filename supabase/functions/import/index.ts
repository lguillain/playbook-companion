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

    const { provider, content } = await req.json();

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

    // Analyze content with Claude
    const analysisResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 8192,
        system: `You are a sales playbook analyzer. Given raw playbook content, you must:
1. Split it into logical sections based on the content's natural structure.
2. Map each section to the relevant skills from the EXACT list below using their IDs.
3. Assess every skill's coverage: "covered" (well-documented), "partial" (mentioned but incomplete), "missing" (not found in the playbook).

SKILLS FRAMEWORK (use ONLY these skill IDs):

${skillsBlock}

RULES:
- Use ONLY skill IDs from the list above (e.g. "i1", "m2", "dm3"). Do not invent new IDs.
- Every skill must appear in skillAssessments with a status.
- Each skill should be mapped to at most ONE section (the most relevant one).
- Keep section content faithful to the original text. Preserve the original wording and structure.
- Return ONLY valid JSON, no other text.

Return this JSON structure:
{
  "sections": [
    { "title": "Section Title", "content": "section content in markdown...", "skillIds": ["i1", "i2"] }
  ],
  "skillAssessments": [
    { "id": "i1", "status": "covered" },
    { "id": "i2", "status": "partial" }
  ]
}`,
        messages: [{ role: "user", content: `Analyze this playbook content:\n\n${content}` }],
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
      sections: { title: string; content: string; skillIds: string[] }[];
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

    // Insert sections
    for (let i = 0; i < analysis.sections.length; i++) {
      const section = analysis.sections[i];

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

      // Create section_skills junctions and update skill section_title
      const validSkillIds = (section.skillIds ?? []).filter((id) => ALL_SKILL_IDS.has(id));
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
        metadata: { sections_created: analysis.sections.length },
      })
      .eq("id", importRecord.id);

    return new Response(
      JSON.stringify({
        importId: importRecord.id,
        sectionsCreated: analysis.sections.length,
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
