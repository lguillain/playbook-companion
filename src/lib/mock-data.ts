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

export type EditSource = "chat" | "manual";

export type StagedEdit = {
  id: string;
  section: string;
  before: string;
  after: string;
  timestamp: string;
  status: "pending" | "approved" | "rejected";
  source?: EditSource;
};

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
};

export const skillsFramework: SkillCategory[] = [
  {
    id: "icp",
    name: "ICP & Problem Landscape",
    skills: [
      { id: "i1", name: "ICP Definition", status: "covered", lastUpdated: "2026-01-15", section: "ICP & Buyer Personas" },
      { id: "i2", name: "ICP Fit Assessment & Red Flags", status: "partial", lastUpdated: "2025-09-22", section: "ICP & Buyer Personas" },
      { id: "i3", name: "Persona Challenges & Success Metrics", status: "covered", lastUpdated: "2026-01-10", section: "ICP & Buyer Personas" },
      { id: "i4", name: "Decision-Maker Roles & Buying Groups", status: "missing" },
    ],
  },
  {
    id: "messaging",
    name: "Value Proposition & Messaging",
    skills: [
      { id: "m1", name: "Core Value Proposition", status: "covered", lastUpdated: "2026-01-20", section: "Demo Scripts & Positioning" },
      { id: "m2", name: "Persona-Specific Messaging", status: "partial", lastUpdated: "2025-11-12", section: "Competitive Intelligence" },
      { id: "m3", name: "Pitch Scripts", status: "missing" },
      { id: "m4", name: "Objection Handling Foundations", status: "partial", lastUpdated: "2025-12-01", section: "Objection Handling" },
    ],
  },
  {
    id: "vocabulary",
    name: "Sales Vocabulary & Buyer Language",
    skills: [
      { id: "v1", name: "Internal Sales Terminology", status: "covered", lastUpdated: "2026-01-18", section: "Qualification Framework" },
      { id: "v2", name: "Buyer-Facing Terminology", status: "partial", lastUpdated: "2025-10-05", section: "ICP & Buyer Personas" },
      { id: "v3", name: "Terms to Avoid & Correct Usage", status: "missing" },
    ],
  },
  {
    id: "qualification",
    name: "Qualification & Risk Assessment",
    skills: [
      { id: "q1", name: "Qualification Methodology", status: "covered", lastUpdated: "2026-01-20", section: "Qualification Framework" },
      { id: "q2", name: "ICP Fit in Qualification", status: "partial", lastUpdated: "2025-11-30", section: "Qualification Framework" },
      { id: "q3", name: "Risk Detection Guidance", status: "missing" },
      { id: "q4", name: "Deal Health Flags", status: "missing" },
    ],
  },
  {
    id: "process",
    name: "Sales Process & Meeting Sequences",
    skills: [
      { id: "p1", name: "Sales Process Overview", status: "covered", lastUpdated: "2026-01-28", section: "Sales Process & Stages" },
      { id: "p2", name: "Stage Exit Criteria", status: "covered", lastUpdated: "2026-01-28", section: "Sales Process & Stages" },
      { id: "p3", name: "Meeting Sequences", status: "partial", lastUpdated: "2025-12-15", section: "Pricing & Procurement" },
      { id: "p4", name: "Process Best Practices & Examples", status: "missing" },
    ],
  },
  {
    id: "discovery",
    name: "Discovery & Customer-Centric Questioning",
    skills: [
      { id: "d1", name: "Company-Specific Discovery Questions", status: "partial", lastUpdated: "2025-11-18", section: "Qualification Framework" },
      { id: "d2", name: "Stakeholder Mapping Questions", status: "missing" },
      { id: "d3", name: "Discovery-to-Value Connection", status: "missing" },
    ],
  },
  {
    id: "demo",
    name: "Demo & Solution Fit",
    skills: [
      { id: "dm1", name: "Demo Storyline & Sequence", status: "covered", lastUpdated: "2026-01-25", section: "Demo Scripts & Positioning" },
      { id: "dm2", name: "Customer-Specific Demo Examples", status: "partial", lastUpdated: "2025-12-01", section: "Demo Scripts & Positioning" },
      { id: "dm3", name: "Solution Fit Assessment", status: "missing" },
      { id: "dm4", name: "Persona-Based Demo Adaptation", status: "missing" },
    ],
  },
  {
    id: "objections",
    name: "Objection & Pricing Handling",
    skills: [
      { id: "o1", name: "Context-Aware Objection Handling", status: "covered", lastUpdated: "2026-01-22", section: "Objection Handling" },
      { id: "o2", name: "Persona-Specific Objection Patterns", status: "partial", lastUpdated: "2025-11-30", section: "Objection Handling" },
      { id: "o3", name: "Pricing Question Guidelines", status: "covered", lastUpdated: "2026-01-15", section: "Pricing & Procurement" },
      { id: "o4", name: "Top Rep Response Examples", status: "missing" },
    ],
  },
  {
    id: "tools",
    name: "Tools, Tech Stack & Usage",
    skills: [
      { id: "t1", name: "CRM Usage Rules & Fields", status: "covered", lastUpdated: "2026-01-30", section: "Handoff & Collaboration" },
      { id: "t2", name: "Sales Engagement Tools", status: "partial", lastUpdated: "2025-10-20", section: "Handoff & Collaboration" },
      { id: "t3", name: "Handover Processes", status: "missing" },
    ],
  },
  {
    id: "deals",
    name: "Opportunity Management & Deal Control",
    skills: [
      { id: "dl1", name: "Mutual Commitment Checklists", status: "covered", lastUpdated: "2026-01-28", section: "Sales Process & Stages" },
      { id: "dl2", name: "Next-Step Control Techniques", status: "partial", lastUpdated: "2025-11-12", section: "Sales Process & Stages" },
      { id: "dl3", name: "Internal Alignment Playbook", status: "missing" },
    ],
  },
];

export const playbookSections: PlaybookSection[] = [
  {
    id: "s1",
    title: "ICP & Buyer Personas",
    content: `## Ideal Customer Profile\n\n### Company-Level Criteria\n**Size:** 10-100 sales employees (Scale-up)\n**Market:** DACH, UK, BENELUX, Nordics, US\n**Industry:** Software Development (SaaS), IT & Services, Technology companies (Fintech, HR Tech)\n**Necessary factors:** B2B Sales, Product sales (NOT Service sales)\n\n### Key Buyer Personas\n\n**CRO / Head of Sales**\n- Behind with revenue, needs to drive new strategy faster\n- Wants reliable forecasting and better growth planning\n- Impact: Faster growth, outpace competitors, increased win rate\n\n**Sales Enablement Manager**\n- Needs to deliver upskilling without additional costs\n- Wants to invoke behavior change through repetitive coaching\n- Impact: Individual coaching at scale, middle-managers freed up\n\n**CEO (Economic Buyer)**\n- Show the board that people are trained and developed\n- Needs arguments when salespeople aren't reaching targets\n- Impact: More reliable forecasting, peace of mind`,
    lastUpdated: "2026-01-15",
    skillsCovered: ["i1", "i2", "i3", "v2"],
  },
  {
    id: "s2",
    title: "Qualification Framework",
    content: `## MEDDICC Framework\nUse MEDDICC for enterprise/mid-market deals; BANT for high-velocity SMB.\n\n## 5Ps Deal Review Framework\n\n**Pain**\n- Do they have a concrete project with a concrete goal?\n- What is the quantifiable business pain?\n- What's the impact if not solved?\n\n**Priority**\n- Are metrics large enough?\n- Can the project be tied to a business initiative?\n\n**Power**\n- Who is the true economic buyer?\n- Do we have connections high in the organization?\n\n**People**\n- Who is your champion? How do you know?\n- What does each stakeholder care about?\n\n**Process**\n- What steps do they need to make to get to a buying decision?\n- Do we have a compelling event driving timeline?\n- Have we asked about appropriate investment range?`,
    lastUpdated: "2026-01-20",
    skillsCovered: ["q1", "q2", "v1", "d1"],
  },
  {
    id: "s3",
    title: "Demo Scripts & Positioning",
    content: `## The Gold Standard Demo Checklist\n\n1. Did you kick off with a "What We Heard" slide to recap their top goals and pain points?\n2. Did you check in with new stakeholders to confirm priorities?\n3. Did you ask how they do it today before jumping into your platform?\n4. Did you stick to only the features that solve their core use case?\n5. Did you lead with the flashiest, most value-packed feature first?\n6. Did you give a clear "why" before each feature?\n7. Did you dig into their internal process to set up multithreading?\n8. Did you clearly explain how your product is different?\n9. After each feature, did you ask "what was going through your mind?"\n10. Did you lock in the next call live, with who else should be there?\n\n## Demo Structure (4-Step Flow)\n\n**Step 1: Recap What You've Heard**\nSummarize use cases and negative impact if nothing changes.\n\n**Step 2: Get Permission**\n"Here's what I'd like to do... does that sound okay?"\n\n**Step 3: Show Best Feature First**\nStart with hair-on-fire problem, not a tour.\n\n**Step 4: Ask After Each Feature**\n- "Do you see yourself using this?"\n- "Compared to today... more effective and efficient?"`,
    lastUpdated: "2026-01-25",
    skillsCovered: ["dm1", "dm2", "m1"],
  },
  {
    id: "s4",
    title: "Objection Handling",
    content: `## Common Cold Call Objections\n\n**"Send me an email"**\n→ "Sure, that's a great suggestion. Can I add something? Let's book a meeting in 1-2 weeks, I send you the material, and if you don't like it, you can still cancel. When works for you?"\n\n**"We already have trainings in place"**\n→ "That's great. What we realized with our clients is that only 5-10% of reps actually consume those resources and keep content over time. Is that something that sounds familiar?"\n\n**"Are you another recording tool like Gong?"**\n→ "Are you using a recording tool already? We don't record calls - that needs to be in place. The challenge with Gong is nobody uses their coaching feature because no rep proactively watches the overwhelming feedback. They never learn. We coach proactively in Slack/Teams."\n\n## Discovery/Demo Objections\n\n**"Data privacy concerns (Betriebsrat)"**\n→ Anonymized data approach. Explain Works Council requirements and how we handle visibility.\n\n**"How do you measure behavior change?"**\n→ Two approaches: (1) Analyze call quality improvement over 3 months, (2) Track skill points improvement in personal skill table.`,
    lastUpdated: "2026-01-22",
    skillsCovered: ["o1", "o2", "m4"],
  },
  {
    id: "s5",
    title: "Sales Process & Stages",
    content: `## Sales Stages with Exit Criteria\n\n**Meeting Booked**\nQuestion: Do we have a meeting with an ICP?\nExit: Accepted by AE, matches ICP and Persona criteria\n\n**1: Problem/Use Case Agreement**\nQuestion: Do they have a problem we can solve?\nExit: 2-3 business initiatives identified\n\n**2: Priority Agreement**\nQuestion: Are problems big enough to prioritize?\nExit: Quantified business initiatives\n\n**3: Solution/Value Agreement**\nQuestion: Is our solution worth investing in?\nExit: They think our solution can solve their problem\n\n**4: Power Agreement**\nQuestion: Does Economic Buyer agree?\nExit: Approved proposal, implementation date, MAP in place\n\n**5: Commercial Agreement**\nQuestion: Are you going to buy?\nExit: Executed contract, notes to post-sales\n\n## Stage Progression Rules\nUse stage checklists to prevent slippage. Validate pains, stakeholders, next steps. Tie every commit to a mutual action plan.`,
    lastUpdated: "2026-01-28",
    skillsCovered: ["p1", "p2", "dl1", "dl2"],
  },
  {
    id: "s6",
    title: "Competitive Intelligence",
    content: `## Key Competitors\n\n**Arist**\n- Category: Learning for Sales Teams\n- Differentiation: We're based on skills with extremely structured approach. Managers can add skills anytime and tutor gets work done.\n\n**Seismic & Highspot**\n- Category: Sales Enablement platforms\n- Differentiation: We focus on proactive coaching vs. content management\n\n**wejam**\n- Category: AI Role Play\n- Differentiation: We coach on real interactions, not just simulations\n\n**Mindtickle & Spekit**\n- Category: Learning Enablement\n- Differentiation: Real-time coaching embedded in workflow vs. LMS approach\n\n## Trap-Setting Questions\n- "How does your tool ensure reps actually use the coaching feedback?"\n- "Can you measure skill development beyond activity metrics?"\n- "How do you handle coaching in languages beyond English?"`,
    lastUpdated: "2025-11-30",
    skillsCovered: ["m2"],
  },
  {
    id: "s7",
    title: "Pricing & Procurement",
    content: `## Discounting Rules\n\n| Discount | Approver |\n|----------|----------|\n| 0-10% | AE |\n| 10-20% | Manager |\n| 20%+ | VP Sales |\n\n**Never trade price for silence** — trade for references, term, or scope.\n\n## Procurement Navigation\nKeep standard clause library and escalation matrix. Pre-empt InfoSec reviews with documentation packs.\n\n## Legal Redline Playbook\nStandard MSA, Order Form, DPA, and SOW templates maintained by Legal.\n\n## Works Council Considerations\nIn Germany, works councils have co-determination rights for employee monitoring tools. Skill profiles may require:\n- Limiting visibility to employee-only view\n- Renaming features (e.g., "wallet")\n- Ensuring no direct link to compensation`,
    lastUpdated: "2025-12-15",
    skillsCovered: ["o3", "p3"],
  },
  {
    id: "s8",
    title: "Handoff & Collaboration",
    content: `## AE to Customer Success Handoff\n\n**Required Information:**\n- Business case and success plan\n- Timeline and hard deadlines\n- Risks and mitigation strategies\n- Stakeholder map with champions\n- Integration requirements\n- Expected outcomes and metrics\n\n**Handoff Checklist:**\n- [ ] Share deal context within 24 hours of close\n- [ ] Introduce CSM to champion\n- [ ] Schedule kickoff call within 1 week\n- [ ] Transfer all relevant Slack/email threads\n- [ ] Align on adoption milestones\n\n## Working with Marketing (ABM)\nWeekly sync on target lists, messaging tests, intent data, and persona asset packs.\n\n## Product Feedback Loop\nCollect feature requests and objections; tag by segment and ARR; route to Product with priority scores.`,
    lastUpdated: "2026-01-30",
    skillsCovered: ["t1", "t2"],
  },
];

export const stagedEdits: StagedEdit[] = [
  {
    id: "e1",
    section: "Qualification Framework",
    before: "**Power**\n- Who is the true economic buyer?",
    after: "**Power**\n- Who has the authority to release the funds and who will sign the deal?\n- Who is the true economic buyer?\n- Do we have connections high in the organization?",
    timestamp: "2026-02-10T09:15:00",
    status: "pending",
    source: "chat",
  },
  {
    id: "e2",
    section: "Demo Scripts & Positioning",
    before: "",
    after: "## Closing the Demo: Summarize, Score, Decide\n\nAt the end of the demo:\n1. Summarize each challenge in their words\n2. Ask: \"From 0 to 10, how important is it to solve this the way we showed?\"\n3. If below 8, pause: \"What would need to be true to move this to an 8 or 9?\"\n4. If 8-10, ask: \"Who else should be involved before signing?\"",
    timestamp: "2026-02-10T10:45:00",
    status: "pending",
    source: "chat",
  },
  {
    id: "e3",
    section: "Objection Handling",
    before: "**\"Data privacy concerns (Betriebsrat)\"**\n→ Anonymized data approach. Explain Works Council requirements and how we handle visibility.",
    after: "**\"Data privacy concerns (Betriebsrat)\"**\n→ \"In Germany, works councils focus on employee monitoring, not data privacy. We handle this by:\n1. Offering employee-only skill profile views\n2. No direct link to compensation or performance reviews\n3. Skills framed as development tool, not evaluation\nWe've successfully navigated this with 8+ German customers.\"",
    timestamp: "2026-02-10T11:20:00",
    status: "approved",
    source: "manual",
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
