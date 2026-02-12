/**
 * Canonical skills framework.
 * This is the SINGLE source of truth for skill IDs and names.
 * Both import functions use this to constrain Claude's analysis.
 */

export const SKILL_CATEGORIES = [
  {
    id: "icp",
    name: "ICP & Problem Landscape",
    skills: [
      { id: "i1", name: "ICP Definition" },
      { id: "i2", name: "ICP Fit Assessment & Red Flags" },
      { id: "i3", name: "Persona Challenges & Success Metrics" },
      { id: "i4", name: "Decision-Maker Roles & Buying Groups" },
      { id: "i5", name: "Use Cases & Proven Value" },
    ],
  },
  {
    id: "messaging",
    name: "Value Proposition & Messaging",
    skills: [
      { id: "m1", name: "Core Value Proposition" },
      { id: "m2", name: "Persona-Specific Messaging" },
      { id: "m3", name: "Pitch Scripts" },
      { id: "m4", name: "Objection Handling Foundations" },
      { id: "m5", name: "Product Capabilities & Customer Outcomes" },
    ],
  },
  {
    id: "vocabulary",
    name: "Sales Vocabulary & Buyer Language",
    skills: [
      { id: "v1", name: "Internal Sales Terminology" },
      { id: "v2", name: "Buyer-Facing Terminology" },
      { id: "v3", name: "Terms to Avoid & Correct Usage" },
      { id: "v4", name: "Key Industry Terms" },
      { id: "v5", name: "Correct Language Examples" },
    ],
  },
  {
    id: "qualification",
    name: "Qualification & Risk Assessment",
    skills: [
      { id: "q1", name: "Qualification Methodology" },
      { id: "q2", name: "ICP Fit in Qualification" },
      { id: "q3", name: "Risk Detection Guidance" },
      { id: "q4", name: "Deal Health Flags" },
      { id: "q5", name: "True Requirements vs Nice-to-Haves" },
    ],
  },
  {
    id: "process",
    name: "Sales Process & Meeting Sequences",
    skills: [
      { id: "p1", name: "Sales Process Overview" },
      { id: "p2", name: "Stage Exit Criteria" },
      { id: "p3", name: "Meeting Sequences" },
      { id: "p4", name: "Process Best Practices & Examples" },
      { id: "p5", name: "Common Mistakes & What Good Looks Like" },
    ],
  },
  {
    id: "discovery",
    name: "Discovery & Customer-Centric Questioning",
    skills: [
      { id: "d1", name: "Company-Specific Discovery Questions" },
      { id: "d2", name: "Stakeholder Mapping Questions" },
      { id: "d3", name: "Discovery-to-Value Connection" },
      { id: "d4", name: "True Requirements Probing" },
      { id: "d5", name: "Decision Process Uncovering" },
    ],
  },
  {
    id: "demo",
    name: "Demo & Solution Fit",
    skills: [
      { id: "dm1", name: "Demo Storyline & Sequence" },
      { id: "dm2", name: "Customer-Specific Demo Examples" },
      { id: "dm3", name: "Solution Fit Assessment" },
      { id: "dm4", name: "Persona-Based Demo Adaptation" },
      { id: "dm5", name: "Risk Areas & Humility" },
    ],
  },
  {
    id: "objections",
    name: "Objection & Pricing Handling",
    skills: [
      { id: "o1", name: "Context-Aware Objection Handling" },
      { id: "o2", name: "Persona-Specific Objection Patterns" },
      { id: "o3", name: "Pricing Question Guidelines" },
      { id: "o4", name: "Top Rep Response Examples" },
      { id: "o5", name: "Trust Preservation Do's & Don'ts" },
    ],
  },
  {
    id: "tools",
    name: "Tools, Tech Stack & Usage",
    skills: [
      { id: "t1", name: "CRM Usage Rules & Fields" },
      { id: "t2", name: "Sales Engagement Tools" },
      { id: "t3", name: "Handover Processes" },
      { id: "t4", name: "Meeting Notes Standards" },
      { id: "t5", name: "Forecasting Expectations" },
    ],
  },
  {
    id: "deals",
    name: "Opportunity Management & Deal Control",
    skills: [
      { id: "dl1", name: "Mutual Commitment Checklists" },
      { id: "dl2", name: "Next-Step Control Techniques" },
      { id: "dl3", name: "Internal Alignment Playbook" },
      { id: "dl4", name: "Opportunity Prioritization" },
      { id: "dl5", name: "Decision Process Understanding" },
    ],
  },
] as const;

export const ALL_SKILL_IDS = new Set(
  SKILL_CATEGORIES.flatMap((c) => c.skills.map((s) => s.id))
);

/** Build the skills reference block for the Claude analysis prompt. */
export function getSkillsPromptBlock(): string {
  return SKILL_CATEGORIES.map(
    (c) =>
      `${c.name}:\n${c.skills.map((s) => `  ${s.id}: ${s.name}`).join("\n")}`
  ).join("\n\n");
}
