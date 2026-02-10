export type SkillCategory = {
  id: string;
  name: string;
  skills: Skill[];
};

export type Skill = {
  id: string;
  name: string;
  status: "covered" | "partial" | "missing";
  lastUpdated?: string;
  section?: string;
};

export type PlaybookSection = {
  id: string;
  title: string;
  content: string;
  lastUpdated: string;
  skillsCovered: string[];
};

export type StagedEdit = {
  id: string;
  section: string;
  before: string;
  after: string;
  timestamp: string;
  status: "pending" | "approved" | "rejected";
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
};

export const skillsFramework: SkillCategory[] = [
  {
    id: "discovery",
    name: "Discovery",
    skills: [
      { id: "d1", name: "Qualification Questions", status: "covered", lastUpdated: "2025-12-15", section: "Discovery Playbook" },
      { id: "d2", name: "Pain Point Mapping", status: "covered", lastUpdated: "2025-11-20", section: "Discovery Playbook" },
      { id: "d3", name: "Stakeholder Identification", status: "partial", lastUpdated: "2025-09-10", section: "Discovery Playbook" },
      { id: "d4", name: "Budget Discovery", status: "missing" },
    ],
  },
  {
    id: "demo",
    name: "Demo & Presentation",
    skills: [
      { id: "dm1", name: "Value Proposition Framing", status: "covered", lastUpdated: "2026-01-05", section: "Demo Guide" },
      { id: "dm2", name: "Competitive Positioning", status: "missing" },
      { id: "dm3", name: "ROI Calculator Walkthrough", status: "missing" },
      { id: "dm4", name: "Technical Deep Dive", status: "covered", lastUpdated: "2025-12-28", section: "Demo Guide" },
    ],
  },
  {
    id: "negotiation",
    name: "Negotiation",
    skills: [
      { id: "n1", name: "Pricing Objection Handling", status: "covered", lastUpdated: "2026-01-15", section: "Negotiation Tactics" },
      { id: "n2", name: "Discount Approval Process", status: "covered", lastUpdated: "2025-10-01", section: "Negotiation Tactics" },
      { id: "n3", name: "Contract Negotiation", status: "partial", lastUpdated: "2025-08-22", section: "Negotiation Tactics" },
      { id: "n4", name: "Multi-threading Strategy", status: "missing" },
    ],
  },
  {
    id: "closing",
    name: "Closing",
    skills: [
      { id: "c1", name: "Trial Close Techniques", status: "covered", lastUpdated: "2026-01-20", section: "Closing Guide" },
      { id: "c2", name: "Procurement Navigation", status: "missing" },
      { id: "c3", name: "Legal Review Process", status: "partial", lastUpdated: "2025-07-15", section: "Closing Guide" },
      { id: "c4", name: "Champion Enablement", status: "covered", lastUpdated: "2025-12-10", section: "Closing Guide" },
    ],
  },
  {
    id: "onboarding",
    name: "Post-Sale",
    skills: [
      { id: "o1", name: "Handoff Process", status: "covered", lastUpdated: "2026-01-08", section: "Post-Sale Playbook" },
      { id: "o2", name: "Expansion Playbook", status: "missing" },
      { id: "o3", name: "QBR Framework", status: "missing" },
    ],
  },
];

export const playbookSections: PlaybookSection[] = [
  {
    id: "s1",
    title: "Discovery Playbook",
    content: `## Discovery Process\n\nOur discovery process follows a structured approach to understanding the prospect's needs.\n\n### Qualification Questions\n- What business problem are you trying to solve?\n- What's the impact of not solving this problem?\n- Who else is involved in this decision?\n- What's your timeline for making a decision?\n\n### Pain Point Mapping\nMap each pain point to our solution capabilities:\n1. Identify the core pain\n2. Quantify the business impact\n3. Connect to our value proposition`,
    lastUpdated: "2025-12-15",
    skillsCovered: ["d1", "d2", "d3"],
  },
  {
    id: "s2",
    title: "Demo Guide",
    content: `## Demo Best Practices\n\n### Value Proposition Framing\nAlways lead with the business outcome, not the feature.\n\n**Framework:**\n- Start with their stated pain point\n- Show the "day in the life" transformation\n- Quantify the time/money saved\n\n### Technical Deep Dive\nOnly go deep when the technical buyer is present.\n- Architecture overview (2 min max)\n- Security & compliance positioning\n- Integration capabilities`,
    lastUpdated: "2026-01-05",
    skillsCovered: ["dm1", "dm4"],
  },
  {
    id: "s3",
    title: "Negotiation Tactics",
    content: `## Negotiation Playbook\n\n### Pricing Objections\n**"It's too expensive"**\n→ Reframe around ROI and total cost of ownership\n→ Compare to cost of inaction\n\n### Discount Approval\n| Discount | Approver |\n|----------|----------|\n| 0-10% | AE |\n| 10-20% | Manager |\n| 20%+ | VP Sales |`,
    lastUpdated: "2026-01-15",
    skillsCovered: ["n1", "n2", "n3"],
  },
  {
    id: "s4",
    title: "Closing Guide",
    content: `## Closing Techniques\n\n### Trial Close\nUse throughout the sales cycle, not just at the end.\n- "If we can solve X, would you be ready to move forward?"\n- "What would need to be true for you to choose us?"\n\n### Champion Enablement\nArm your champion with:\n1. Internal business case template\n2. ROI calculator pre-filled\n3. Competitive comparison one-pager`,
    lastUpdated: "2026-01-20",
    skillsCovered: ["c1", "c4"],
  },
  {
    id: "s5",
    title: "Post-Sale Playbook",
    content: `## Post-Sale Handoff\n\n### Handoff Checklist\n- [ ] Introduce CSM within 24 hours of close\n- [ ] Share deal context document\n- [ ] Schedule kickoff call within 1 week\n- [ ] Transfer all relevant Slack/email threads`,
    lastUpdated: "2026-01-08",
    skillsCovered: ["o1"],
  },
];

export const stagedEdits: StagedEdit[] = [
  {
    id: "e1",
    section: "Discovery Playbook",
    before: "Who else is involved in this decision?",
    after: "Who else is involved in this decision? What's their role in the evaluation process?",
    timestamp: "2026-02-09T14:30:00",
    status: "pending",
  },
  {
    id: "e2",
    section: "Negotiation Tactics",
    before: "",
    after: "### Multi-threading Strategy\nAlways engage 3+ stakeholders:\n- Economic buyer\n- Technical evaluator\n- End user champion\n\nNever rely on a single thread.",
    timestamp: "2026-02-09T15:10:00",
    status: "pending",
  },
];

export function getHealthScore(): { score: number; covered: number; total: number; partial: number; missing: number; outdated: number } {
  const allSkills = skillsFramework.flatMap((c) => c.skills);
  const total = allSkills.length;
  const covered = allSkills.filter((s) => s.status === "covered").length;
  const partial = allSkills.filter((s) => s.status === "partial").length;
  const missing = allSkills.filter((s) => s.status === "missing").length;

  const now = new Date();
  const outdated = allSkills.filter((s) => {
    if (!s.lastUpdated) return false;
    const diff = now.getTime() - new Date(s.lastUpdated).getTime();
    return diff > 90 * 24 * 60 * 60 * 1000; // 90 days
  }).length;

  const score = Math.round(((covered + partial * 0.5) / total) * 100);
  return { score, covered, total, partial, missing, outdated };
}
