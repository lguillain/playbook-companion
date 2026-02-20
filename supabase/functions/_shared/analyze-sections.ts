import { createClient } from "jsr:@supabase/supabase-js@2";
import { getSkillsPromptBlock, ALL_SKILL_IDS } from "./skills.ts";

type SupabaseAdmin = ReturnType<typeof createClient>;

export type SectionForAnalysis = {
  id: string;
  title: string;
  content: string;
  lastModified?: string | null;
};

type SectionSkillEntry = { id: string; reason?: string };
type AnalysisResult = {
  sectionSkills: { sectionIndex: number; skills: SectionSkillEntry[] }[];
  skillAssessments: { id: string; status: string; reason?: string }[];
};

/**
 * Analyze playbook sections for skill coverage using Claude,
 * then write skill mappings and assessments back to the database.
 *
 * Expects sections to already exist in `playbook_sections` (caller handles insertion).
 */
export async function analyzeSections(
  sections: SectionForAnalysis[],
  adminClient: SupabaseAdmin,
  userId: string,
  anthropicApiKey: string,
): Promise<{ sectionsAnalyzed: number }> {
  // Build prompt content
  const sectionsContent = sections
    .map((s, i) => `[Section ${i}] "${s.title}"\n${s.content}`)
    .join("\n\n---\n\n");

  const skillsBlock = getSkillsPromptBlock();

  // Call Claude
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": anthropicApiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-opus-4-6",
      max_tokens: 16384,
      temperature: 0,
      system: `You are a sales playbook analyzer. Given the full content of a sales playbook, you must:

1. For EVERY skill, determine the section where it is addressed or where it SHOULD be addressed.
   - For covered/partial skills: map to the section that addresses the skill.
   - For missing skills: map to the section where the content would most naturally belong.
   This mapping tells users where each skill lives (or should live) in their playbook.

2. Assess every skill's coverage based on the section content:
   - "covered": a rep could read this section and know what to do — it has practical guidance they can act on
   - "partial": the topic is addressed but a rep would still have questions — explain what's missing
   - "missing": not meaningfully addressed — explain what content should be added

WHAT A GOOD SALES PLAYBOOK COVERS (calibration reference):
A sales playbook is a practical guide for reps. It tells them what to say, when, why, and how. Judge coverage against these realistic standards — not against a theoretical ideal:

- ICP & Personas: Who to target, who to avoid, key pain points by role. A list of target personas with their challenges counts. It does NOT need academic market research.
- Value Proposition & Messaging: What to say to each persona, key differentiators, elevator pitch. Bullet points and talk tracks count. It does NOT need a brand guidelines document.
- Discovery & Questioning: What questions to ask and why. A curated question list organized by topic counts as covered. It does NOT need a questioning methodology textbook.
- Qualification: How to assess deal quality, when to walk away. Simple criteria or a checklist counts. It does NOT need a formal scoring model.
- Sales Process: The stages, what happens in each, exit criteria. A stage overview with key actions counts. It does NOT need detailed SOPs for every edge case.
- Objection Handling: Common objections with suggested responses. A list of objections and answers counts. It does NOT need psychological frameworks.
- Demo: How to structure a demo, what to show. A demo flow or outline counts. It does NOT need a slide-by-slide script.
- Tools: Which tools to use and when. A list of tools with their purpose counts. It does NOT need configuration guides or setup instructions.
- Deal Management: How to manage opportunities, next steps, internal alignment. Practical checklists count. It does NOT need project management methodology.

Be generous when content is practical and actionable, even if brief. Be critical only when a topic is genuinely absent or so vague a rep couldn't act on it.

IMPORTANT DISTINCTIONS — do not confuse these:
- Customer/market-facing content (ICP, use cases, value propositions, personas, objection handling) is about the BUYER and the PRODUCT's value to them.
- Internal process content (CRM rules, tools, handover processes, forecasting) is about how the SALES TEAM operates internally.
- A section about "client examples" or "case studies" relates to Use Cases & Proven Value, NOT to internal tooling.
- A section about "meeting notes" or "CRM fields" relates to internal tooling, NOT to discovery or qualification methodology.

SKILLS FRAMEWORK (use ONLY these skill IDs):

${skillsBlock}

RULES:
- Use ONLY skill IDs from the list above (e.g. "i1", "m2", "dm3"). Do not invent new IDs.
- Every skill must appear in skillAssessments with a status.
- Every skill MUST appear in sectionSkills mapped to at least one section — this tells the user where the skill lives or should live.
- A skill CAN be mapped to multiple sections if it is genuinely addressed in more than one place.
- Be honest but fair about coverage — if a rep could use the content to do their job, it's "covered".
- In sectionSkills, include a "reason" per partial/missing skill explaining what a rep would still need after reading THAT specific section, or what practical content to add there. Do NOT reference other sections.
- In skillAssessments, include a "reason" per partial/missing skill giving a brief overall summary of the gap across the whole playbook.
- Return ONLY valid JSON, no other text.

Return this JSON structure:
{
  "sectionSkills": [
    { "sectionIndex": 0, "skills": [
      { "id": "i1" },
      { "id": "i2", "reason": "Lists target accounts but no criteria for scoring fit or identifying red flags" }
    ]},
    { "sectionIndex": 1, "skills": [
      { "id": "m1", "reason": "Add 2-3 talk tracks tailored to each persona" }
    ]}
  ],
  "skillAssessments": [
    { "id": "i1", "status": "covered" },
    { "id": "i2", "status": "partial", "reason": "ICP fit criteria exist but lack scoring or red flag indicators" },
    { "id": "m1", "status": "missing", "reason": "No persona-specific messaging found in the playbook" }
  ]
}`,
      messages: [
        {
          role: "user",
          content: `Analyze these ${sections.length} playbook sections and map skills based on the actual content:\n\n${sectionsContent}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    const errBody = await response.text();
    throw new Error(`Claude API error: ${response.status} – ${errBody}`);
  }

  const data = await response.json();
  const text = data.content[0].text;

  // Parse JSON (with truncation repair)
  const jsonMatch = text.match(/\{[\s\S]*\}/);
  if (!jsonMatch) throw new Error("Failed to parse analysis response");

  let analysis: AnalysisResult;
  try {
    analysis = JSON.parse(jsonMatch[0]);
  } catch (parseErr) {
    let fixedJson = jsonMatch[0];
    fixedJson = fixedJson.replace(/,\s*[^,\[\]{}]*$/, "");
    const opens =
      (fixedJson.match(/\[/g) || []).length -
      (fixedJson.match(/\]/g) || []).length;
    const braces =
      (fixedJson.match(/\{/g) || []).length -
      (fixedJson.match(/\}/g) || []).length;
    for (let i = 0; i < opens; i++) fixedJson += "]";
    for (let i = 0; i < braces; i++) fixedJson += "}";
    try {
      analysis = JSON.parse(fixedJson);
    } catch {
      throw new Error(
        `Failed to parse Claude analysis: ${(parseErr as Error).message}`,
      );
    }
  }

  // Build index → skills lookup (with per-section reasons)
  const skillsByIndex = new Map<number, SectionSkillEntry[]>();
  for (const s of analysis.sectionSkills ?? []) {
    // Support both new format (skills array) and legacy format (skillIds array)
    const entries: SectionSkillEntry[] = s.skills
      ? s.skills.filter((e) => ALL_SKILL_IDS.has(e.id))
      : ((s as any).skillIds ?? [])
          .filter((id: string) => ALL_SKILL_IDS.has(id))
          .map((id: string) => ({ id }));
    skillsByIndex.set(s.sectionIndex, entries);
  }

  // Clear existing skill mappings
  await adminClient.from("section_skills").delete().eq("user_id", userId);
  await adminClient
    .from("user_skills")
    .update({ status: "missing", last_updated: null, section_title: null, coverage_note: null })
    .eq("user_id", userId);

  const today = new Date().toISOString().split("T")[0];
  const mappedSkillIds = new Set<string>();

  // Build skill → date lookup from section dates
  const skillDateMap = new Map<string, string | null>();
  for (const [sectionIndex, entries] of skillsByIndex) {
    const secDate = sections[sectionIndex]?.lastModified ?? null;
    for (const entry of entries) {
      skillDateMap.set(entry.id, secDate);
    }
  }

  // Write skill → section mappings (with per-section coverage notes)
  for (let i = 0; i < sections.length; i++) {
    const section = sections[i];
    const entries = skillsByIndex.get(i) ?? [];

    for (const entry of entries) {
      mappedSkillIds.add(entry.id);
      await adminClient
        .from("section_skills")
        .insert({
          section_id: section.id,
          skill_id: entry.id,
          user_id: userId,
          coverage_note: entry.reason ?? null,
        });

      await adminClient
        .from("user_skills")
        .update({ section_title: section.title })
        .eq("user_id", userId)
        .eq("skill_id", entry.id);
    }
  }

  // Write skill statuses + ensure every non-missing skill has a section mapping
  if (analysis.skillAssessments) {
    for (const assessment of analysis.skillAssessments) {
      if (!ALL_SKILL_IDS.has(assessment.id)) continue;
      const status = ["covered", "partial", "missing"].includes(
        assessment.status,
      )
        ? assessment.status
        : "missing";

      // If a non-missing skill wasn't mapped to any section, map to the first section
      // so the user knows where to find/add it
      if (
        status !== "missing" &&
        !mappedSkillIds.has(assessment.id) &&
        sections.length > 0
      ) {
        const fallback = sections[0];
        await adminClient
          .from("section_skills")
          .insert({
            section_id: fallback.id,
            skill_id: assessment.id,
            user_id: userId,
          });
        await adminClient
          .from("user_skills")
          .update({ section_title: fallback.title })
          .eq("user_id", userId)
          .eq("skill_id", assessment.id);
      }

      const skillDate = skillDateMap.get(assessment.id) ?? today;
      await adminClient
        .from("user_skills")
        .update({
          status,
          last_updated: status !== "missing" ? skillDate : null,
          coverage_note: assessment.reason ?? null,
        })
        .eq("user_id", userId)
        .eq("skill_id", assessment.id);
    }
  }

  return { sectionsAnalyzed: sections.length };
}
