-- Seed data: replicates mock-data.ts for local development

-- Skill categories
insert into skill_categories (id, name, sort_order) values
  ('icp', 'ICP & Problem Landscape', 1),
  ('messaging', 'Value Proposition & Messaging', 2),
  ('vocabulary', 'Sales Vocabulary & Buyer Language', 3),
  ('qualification', 'Qualification & Risk Assessment', 4),
  ('process', 'Sales Process & Meeting Sequences', 5),
  ('discovery', 'Discovery & Customer-Centric Questioning', 6),
  ('demo', 'Demo & Solution Fit', 7),
  ('objections', 'Objection & Pricing Handling', 8),
  ('tools', 'Tools, Tech Stack & Usage', 9),
  ('deals', 'Opportunity Management & Deal Control', 10);

-- Skills (10 categories x 5 skills = 50 total)
insert into skills (id, category_id, name, status, last_updated, section_title, sort_order) values
  -- ICP & Problem Landscape
  ('i1', 'icp', 'ICP Definition', 'covered', '2026-01-15', 'ICP & Buyer Personas', 1),
  ('i2', 'icp', 'ICP Fit Assessment & Red Flags', 'partial', '2025-09-22', 'ICP & Buyer Personas', 2),
  ('i3', 'icp', 'Persona Challenges & Success Metrics', 'covered', '2026-01-10', 'ICP & Buyer Personas', 3),
  ('i4', 'icp', 'Decision-Maker Roles & Buying Groups', 'missing', null, null, 4),
  ('i5', 'icp', 'Use Cases & Proven Value', 'missing', null, null, 5),
  -- Value Proposition & Messaging
  ('m1', 'messaging', 'Core Value Proposition', 'covered', '2026-01-20', 'Demo Scripts & Positioning', 1),
  ('m2', 'messaging', 'Persona-Specific Messaging', 'partial', '2025-11-12', 'Competitive Intelligence', 2),
  ('m3', 'messaging', 'Pitch Scripts', 'missing', null, null, 3),
  ('m4', 'messaging', 'Objection Handling Foundations', 'partial', '2025-12-01', 'Objection Handling', 4),
  ('m5', 'messaging', 'Product Capabilities & Customer Outcomes', 'missing', null, null, 5),
  -- Sales Vocabulary & Buyer Language
  ('v1', 'vocabulary', 'Internal Sales Terminology', 'covered', '2026-01-18', 'Qualification Framework', 1),
  ('v2', 'vocabulary', 'Buyer-Facing Terminology', 'partial', '2025-10-05', 'ICP & Buyer Personas', 2),
  ('v3', 'vocabulary', 'Terms to Avoid & Correct Usage', 'missing', null, null, 3),
  ('v4', 'vocabulary', 'Key Industry Terms', 'missing', null, null, 4),
  ('v5', 'vocabulary', 'Correct Language Examples', 'missing', null, null, 5),
  -- Qualification & Risk Assessment
  ('q1', 'qualification', 'Qualification Methodology', 'covered', '2026-01-20', 'Qualification Framework', 1),
  ('q2', 'qualification', 'ICP Fit in Qualification', 'partial', '2025-11-30', 'Qualification Framework', 2),
  ('q3', 'qualification', 'Risk Detection Guidance', 'missing', null, null, 3),
  ('q4', 'qualification', 'Deal Health Flags', 'missing', null, null, 4),
  ('q5', 'qualification', 'True Requirements vs Nice-to-Haves', 'missing', null, null, 5),
  -- Sales Process & Meeting Sequences
  ('p1', 'process', 'Sales Process Overview', 'covered', '2026-01-28', 'Sales Process & Stages', 1),
  ('p2', 'process', 'Stage Exit Criteria', 'covered', '2026-01-28', 'Sales Process & Stages', 2),
  ('p3', 'process', 'Meeting Sequences', 'partial', '2025-12-15', 'Pricing & Procurement', 3),
  ('p4', 'process', 'Process Best Practices & Examples', 'missing', null, null, 4),
  ('p5', 'process', 'Common Mistakes & What Good Looks Like', 'missing', null, null, 5),
  -- Discovery & Customer-Centric Questioning
  ('d1', 'discovery', 'Company-Specific Discovery Questions', 'partial', '2025-11-18', 'Qualification Framework', 1),
  ('d2', 'discovery', 'Stakeholder Mapping Questions', 'missing', null, null, 2),
  ('d3', 'discovery', 'Discovery-to-Value Connection', 'missing', null, null, 3),
  ('d4', 'discovery', 'True Requirements Probing', 'missing', null, null, 4),
  ('d5', 'discovery', 'Decision Process Uncovering', 'missing', null, null, 5),
  -- Demo & Solution Fit
  ('dm1', 'demo', 'Demo Storyline & Sequence', 'covered', '2026-01-25', 'Demo Scripts & Positioning', 1),
  ('dm2', 'demo', 'Customer-Specific Demo Examples', 'partial', '2025-12-01', 'Demo Scripts & Positioning', 2),
  ('dm3', 'demo', 'Solution Fit Assessment', 'missing', null, null, 3),
  ('dm4', 'demo', 'Persona-Based Demo Adaptation', 'missing', null, null, 4),
  ('dm5', 'demo', 'Risk Areas & Humility', 'missing', null, null, 5),
  -- Objection & Pricing Handling
  ('o1', 'objections', 'Context-Aware Objection Handling', 'covered', '2026-01-22', 'Objection Handling', 1),
  ('o2', 'objections', 'Persona-Specific Objection Patterns', 'partial', '2025-11-30', 'Objection Handling', 2),
  ('o3', 'objections', 'Pricing Question Guidelines', 'covered', '2026-01-15', 'Pricing & Procurement', 3),
  ('o4', 'objections', 'Top Rep Response Examples', 'missing', null, null, 4),
  ('o5', 'objections', 'Trust Preservation Do''s & Don''ts', 'missing', null, null, 5),
  -- Tools, Tech Stack & Usage
  ('t1', 'tools', 'CRM Usage Rules & Fields', 'covered', '2026-01-30', 'Handoff & Collaboration', 1),
  ('t2', 'tools', 'Sales Engagement Tools', 'partial', '2025-10-20', 'Handoff & Collaboration', 2),
  ('t3', 'tools', 'Handover Processes', 'missing', null, null, 3),
  ('t4', 'tools', 'Meeting Notes Standards', 'missing', null, null, 4),
  ('t5', 'tools', 'Forecasting Expectations', 'missing', null, null, 5),
  -- Opportunity Management & Deal Control
  ('dl1', 'deals', 'Mutual Commitment Checklists', 'covered', '2026-01-28', 'Sales Process & Stages', 1),
  ('dl2', 'deals', 'Next-Step Control Techniques', 'partial', '2025-11-12', 'Sales Process & Stages', 2),
  ('dl3', 'deals', 'Internal Alignment Playbook', 'missing', null, null, 3),
  ('dl4', 'deals', 'Opportunity Prioritization', 'missing', null, null, 4),
  ('dl5', 'deals', 'Decision Process Understanding', 'missing', null, null, 5);

-- Playbook sections
insert into playbook_sections (id, title, content, sort_order, last_updated) values
  ('s1', 'ICP & Buyer Personas', E'## Ideal Customer Profile\n\n### Company-Level Criteria\n**Size:** 10-100 sales employees (Scale-up)\n**Market:** DACH, UK, BENELUX, Nordics, US\n**Industry:** Software Development (SaaS), IT & Services, Technology companies (Fintech, HR Tech)\n**Necessary factors:** B2B Sales, Product sales (NOT Service sales)\n\n### Key Buyer Personas\n\n**CRO / Head of Sales**\n- Behind with revenue, needs to drive new strategy faster\n- Wants reliable forecasting and better growth planning\n- Impact: Faster growth, outpace competitors, increased win rate\n\n**Sales Enablement Manager**\n- Needs to deliver upskilling without additional costs\n- Wants to invoke behavior change through repetitive coaching\n- Impact: Individual coaching at scale, middle-managers freed up\n\n**CEO (Economic Buyer)**\n- Show the board that people are trained and developed\n- Needs arguments when salespeople aren''t reaching targets\n- Impact: More reliable forecasting, peace of mind', 1, '2026-01-15'),

  ('s2', 'Qualification Framework', E'## MEDDICC Framework\nUse MEDDICC for enterprise/mid-market deals; BANT for high-velocity SMB.\n\n## 5Ps Deal Review Framework\n\n**Pain**\n- Do they have a concrete project with a concrete goal?\n- What is the quantifiable business pain?\n- What''s the impact if not solved?\n\n**Priority**\n- Are metrics large enough?\n- Can the project be tied to a business initiative?\n\n**Power**\n- Who is the true economic buyer?\n- Do we have connections high in the organization?\n\n**People**\n- Who is your champion? How do you know?\n- What does each stakeholder care about?\n\n**Process**\n- What steps do they need to make to get to a buying decision?\n- Do we have a compelling event driving timeline?\n- Have we asked about appropriate investment range?', 2, '2026-01-20'),

  ('s3', 'Demo Scripts & Positioning', E'## The Gold Standard Demo Checklist\n\n1. Did you kick off with a "What We Heard" slide to recap their top goals and pain points?\n2. Did you check in with new stakeholders to confirm priorities?\n3. Did you ask how they do it today before jumping into your platform?\n4. Did you stick to only the features that solve their core use case?\n5. Did you lead with the flashiest, most value-packed feature first?\n6. Did you give a clear "why" before each feature?\n7. Did you dig into their internal process to set up multithreading?\n8. Did you clearly explain how your product is different?\n9. After each feature, did you ask "what was going through your mind?"\n10. Did you lock in the next call live, with who else should be there?\n\n## Demo Structure (4-Step Flow)\n\n**Step 1: Recap What You''ve Heard**\nSummarize use cases and negative impact if nothing changes.\n\n**Step 2: Get Permission**\n"Here''s what I''d like to do... does that sound okay?"\n\n**Step 3: Show Best Feature First**\nStart with hair-on-fire problem, not a tour.\n\n**Step 4: Ask After Each Feature**\n- "Do you see yourself using this?"\n- "Compared to today... more effective and efficient?"', 3, '2026-01-25'),

  ('s4', 'Objection Handling', E'## Common Cold Call Objections\n\n**"Send me an email"**\n→ "Sure, that''s a great suggestion. Can I add something? Let''s book a meeting in 1-2 weeks, I send you the material, and if you don''t like it, you can still cancel. When works for you?"\n\n**"We already have trainings in place"**\n→ "That''s great. What we realized with our clients is that only 5-10% of reps actually consume those resources and keep content over time. Is that something that sounds familiar?"\n\n**"Are you another recording tool like Gong?"**\n→ "Are you using a recording tool already? We don''t record calls - that needs to be in place. The challenge with Gong is nobody uses their coaching feature because no rep proactively watches the overwhelming feedback. They never learn. We coach proactively in Slack/Teams."\n\n## Discovery/Demo Objections\n\n**"Data privacy concerns (Betriebsrat)"**\n→ Anonymized data approach. Explain Works Council requirements and how we handle visibility.\n\n**"How do you measure behavior change?"**\n→ Two approaches: (1) Analyze call quality improvement over 3 months, (2) Track skill points improvement in personal skill table.', 4, '2026-01-22'),

  ('s5', 'Sales Process & Stages', E'## Sales Stages with Exit Criteria\n\n**Meeting Booked**\nQuestion: Do we have a meeting with an ICP?\nExit: Accepted by AE, matches ICP and Persona criteria\n\n**1: Problem/Use Case Agreement**\nQuestion: Do they have a problem we can solve?\nExit: 2-3 business initiatives identified\n\n**2: Priority Agreement**\nQuestion: Are problems big enough to prioritize?\nExit: Quantified business initiatives\n\n**3: Solution/Value Agreement**\nQuestion: Is our solution worth investing in?\nExit: They think our solution can solve their problem\n\n**4: Power Agreement**\nQuestion: Does Economic Buyer agree?\nExit: Approved proposal, implementation date, MAP in place\n\n**5: Commercial Agreement**\nQuestion: Are you going to buy?\nExit: Executed contract, notes to post-sales\n\n## Stage Progression Rules\nUse stage checklists to prevent slippage. Validate pains, stakeholders, next steps. Tie every commit to a mutual action plan.', 5, '2026-01-28'),

  ('s6', 'Competitive Intelligence', E'## Key Competitors\n\n**Arist**\n- Category: Learning for Sales Teams\n- Differentiation: We''re based on skills with extremely structured approach. Managers can add skills anytime and tutor gets work done.\n\n**Seismic & Highspot**\n- Category: Sales Enablement platforms\n- Differentiation: We focus on proactive coaching vs. content management\n\n**wejam**\n- Category: AI Role Play\n- Differentiation: We coach on real interactions, not just simulations\n\n**Mindtickle & Spekit**\n- Category: Learning Enablement\n- Differentiation: Real-time coaching embedded in workflow vs. LMS approach\n\n## Trap-Setting Questions\n- "How does your tool ensure reps actually use the coaching feedback?"\n- "Can you measure skill development beyond activity metrics?"\n- "How do you handle coaching in languages beyond English?"', 6, '2025-11-30'),

  ('s7', 'Pricing & Procurement', E'## Discounting Rules\n\n| Discount | Approver |\n|----------|----------|\n| 0-10% | AE |\n| 10-20% | Manager |\n| 20%+ | VP Sales |\n\n**Never trade price for silence** — trade for references, term, or scope.\n\n## Procurement Navigation\nKeep standard clause library and escalation matrix. Pre-empt InfoSec reviews with documentation packs.\n\n## Legal Redline Playbook\nStandard MSA, Order Form, DPA, and SOW templates maintained by Legal.\n\n## Works Council Considerations\nIn Germany, works councils have co-determination rights for employee monitoring tools. Skill profiles may require:\n- Limiting visibility to employee-only view\n- Renaming features (e.g., "wallet")\n- Ensuring no direct link to compensation', 7, '2025-12-15'),

  ('s8', 'Handoff & Collaboration', E'## AE to Customer Success Handoff\n\n**Required Information:**\n- Business case and success plan\n- Timeline and hard deadlines\n- Risks and mitigation strategies\n- Stakeholder map with champions\n- Integration requirements\n- Expected outcomes and metrics\n\n**Handoff Checklist:**\n- [ ] Share deal context within 24 hours of close\n- [ ] Introduce CSM to champion\n- [ ] Schedule kickoff call within 1 week\n- [ ] Transfer all relevant Slack/email threads\n- [ ] Align on adoption milestones\n\n## Working with Marketing (ABM)\nWeekly sync on target lists, messaging tests, intent data, and persona asset packs.\n\n## Product Feedback Loop\nCollect feature requests and objections; tag by segment and ARR; route to Product with priority scores.', 8, '2026-01-30');

-- Section-skill junction
insert into section_skills (section_id, skill_id) values
  ('s1', 'i1'), ('s1', 'i2'), ('s1', 'i3'), ('s1', 'v2'),
  ('s2', 'q1'), ('s2', 'q2'), ('s2', 'v1'), ('s2', 'd1'),
  ('s3', 'dm1'), ('s3', 'dm2'), ('s3', 'm1'),
  ('s4', 'o1'), ('s4', 'o2'), ('s4', 'm4'),
  ('s5', 'p1'), ('s5', 'p2'), ('s5', 'dl1'), ('s5', 'dl2'),
  ('s6', 'm2'),
  ('s7', 'o3'), ('s7', 'p3'),
  ('s8', 't1'), ('s8', 't2');

-- Staged edits (using deterministic UUIDs for seed)
insert into staged_edits (id, section_id, before_text, after_text, status, source, created_at) values
  ('a0000000-0000-0000-0000-000000000001', 's2',
   E'**Power**\n- Who is the true economic buyer?',
   E'**Power**\n- Who has the authority to release the funds and who will sign the deal?\n- Who is the true economic buyer?\n- Do we have connections high in the organization?',
   'pending', 'chat', '2026-02-10T09:15:00Z'),

  ('a0000000-0000-0000-0000-000000000002', 's3',
   '',
   E'## Closing the Demo: Summarize, Score, Decide\n\nAt the end of the demo:\n1. Summarize each challenge in their words\n2. Ask: "From 0 to 10, how important is it to solve this the way we showed?"\n3. If below 8, pause: "What would need to be true to move this to an 8 or 9?"\n4. If 8-10, ask: "Who else should be involved before signing?"',
   'pending', 'chat', '2026-02-10T10:45:00Z'),

  ('a0000000-0000-0000-0000-000000000003', 's4',
   E'**"Data privacy concerns (Betriebsrat)"**\n→ Anonymized data approach. Explain Works Council requirements and how we handle visibility.',
   E'**"Data privacy concerns (Betriebsrat)"**\n→ "In Germany, works councils focus on employee monitoring, not data privacy. We handle this by:\n1. Offering employee-only skill profile views\n2. No direct link to compensation or performance reviews\n3. Skills framed as development tool, not evaluation\nWe''ve successfully navigated this with 8+ German customers."',
   'approved', 'manual', '2026-02-10T11:20:00Z');
