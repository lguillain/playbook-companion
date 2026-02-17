import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { getSkillsPromptBlock, ALL_SKILL_IDS } from "../_shared/skills.ts";

const ANTHROPIC_API_KEY = Deno.env.get("ANTHROPIC_API_KEY");

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Analyze saved playbook sections for skill coverage.
 * Reads sections from the DB, sends full content to Claude, writes skill mappings back.
 * Called AFTER import has saved sections.
 */
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

    const adminClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Read saved sections
    const { data: sections, error: secError } = await adminClient
      .from("playbook_sections")
      .select("id, title, content")
      .eq("user_id", user.id)
      .order("sort_order");

    if (secError) throw secError;
    if (!sections || sections.length === 0) {
      return new Response(
        JSON.stringify({ error: "No sections found. Import a playbook first." }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build full content for Claude
    const sectionsForAnalysis = sections.map((s, i) =>
      `[Section ${i}] "${s.title}"\n${s.content}`
    ).join("\n\n---\n\n");

    const skillsBlock = getSkillsPromptBlock();

    // Send to Claude for skill analysis
    const analysisResponse = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY!,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-4-5-20250929",
        max_tokens: 4096,
        system: `You are a sales playbook analyzer. Given the full content of a sales playbook, you must:
1. Map each section (by its index) to the relevant skills from the EXACT list below using their IDs.
2. Assess every skill's coverage based on the ACTUAL CONTENT (not just titles):
   - "covered": substantive, actionable content (specific guidance, examples, frameworks, detailed methodology)
   - "partial": topic mentioned but lacks depth (few bullet points, vague guidance, brief mention)
   - "missing": not meaningfully addressed

SKILLS FRAMEWORK (use ONLY these skill IDs):

${skillsBlock}

RULES:
- Use ONLY skill IDs from the list above (e.g. "i1", "m2", "dm3"). Do not invent new IDs.
- Every skill must appear in skillAssessments with a status.
- Every covered/partial skill MUST appear in sectionSkills mapped to the most relevant section. Only "missing" skills should have no section mapping.
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
        messages: [{
          role: "user",
          content: `Analyze this sales playbook and map skills based on the actual content:\n\n${sectionsForAnalysis}`,
        }],
      }),
    });

    if (!analysisResponse.ok) {
      const errBody = await analysisResponse.text();
      throw new Error(`Claude API error: ${analysisResponse.status} – ${errBody}`);
    }

    const analysisData = await analysisResponse.json();
    const analysisText = analysisData.content[0].text;

    // Parse JSON
    const jsonMatch = analysisText.match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error("Failed to parse analysis response");

    let analysis: {
      sectionSkills: { sectionIndex: number; skillIds: string[] }[];
      skillAssessments: { id: string; status: string }[];
    };

    try {
      analysis = JSON.parse(jsonMatch[0]);
    } catch (parseErr) {
      let fixedJson = jsonMatch[0];
      fixedJson = fixedJson.replace(/,\s*[^,\[\]{}]*$/, "");
      const opens = (fixedJson.match(/\[/g) || []).length - (fixedJson.match(/\]/g) || []).length;
      const braces = (fixedJson.match(/\{/g) || []).length - (fixedJson.match(/\}/g) || []).length;
      for (let i = 0; i < opens; i++) fixedJson += "]";
      for (let i = 0; i < braces; i++) fixedJson += "}";
      try {
        analysis = JSON.parse(fixedJson);
      } catch {
        throw new Error(`Failed to parse Claude analysis: ${(parseErr as Error).message}`);
      }
    }

    // Build index → skillIds lookup
    const skillsByIndex = new Map<number, string[]>();
    for (const s of analysis.sectionSkills ?? []) {
      skillsByIndex.set(s.sectionIndex, (s.skillIds ?? []).filter((id) => ALL_SKILL_IDS.has(id)));
    }

    // Clear existing skill mappings
    await adminClient.from("section_skills").delete().eq("user_id", user.id);
    await adminClient
      .from("user_skills")
      .update({ status: "missing", last_updated: null, section_title: null })
      .eq("user_id", user.id);

    const today = new Date().toISOString().split("T")[0];
    const mappedSkillIds = new Set<string>();

    // Write skill → section mappings
    for (let i = 0; i < sections.length; i++) {
      const section = sections[i];
      const skillIds = skillsByIndex.get(i) ?? [];

      for (const skillId of skillIds) {
        mappedSkillIds.add(skillId);
        await adminClient
          .from("section_skills")
          .insert({ section_id: section.id, skill_id: skillId, user_id: user.id });

        await adminClient
          .from("user_skills")
          .update({ section_title: section.title })
          .eq("user_id", user.id)
          .eq("skill_id", skillId);
      }
    }

    // Write skill statuses + safety net for orphaned skills
    if (analysis.skillAssessments) {
      for (const assessment of analysis.skillAssessments) {
        if (!ALL_SKILL_IDS.has(assessment.id)) continue;
        const status = ["covered", "partial", "missing"].includes(assessment.status)
          ? assessment.status
          : "missing";

        // Link orphaned non-missing skills to the first section
        if (status !== "missing" && !mappedSkillIds.has(assessment.id) && sections.length > 0) {
          const fallback = sections[0];
          await adminClient
            .from("section_skills")
            .insert({ section_id: fallback.id, skill_id: assessment.id, user_id: user.id });
          await adminClient
            .from("user_skills")
            .update({ section_title: fallback.title })
            .eq("user_id", user.id)
            .eq("skill_id", assessment.id);
        }

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

    return new Response(
      JSON.stringify({ status: "completed", sectionsAnalyzed: sections.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Analyze error:", error);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
