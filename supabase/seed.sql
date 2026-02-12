-- Seed data: global skill framework (shared across all users)
-- Per-user data (playbook sections, skill statuses, edits) is created
-- via import or the signup trigger.

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
  ('deals', 'Opportunity Management & Deal Control', 10)
on conflict (id) do nothing;

-- Skills (definition only — per-user status is in user_skills table)
insert into skills (id, category_id, name, sort_order) values
  -- ICP & Problem Landscape
  ('i1', 'icp', 'ICP Definition', 1),
  ('i2', 'icp', 'ICP Fit Assessment & Red Flags', 2),
  ('i3', 'icp', 'Persona Challenges & Success Metrics', 3),
  ('i4', 'icp', 'Decision-Maker Roles & Buying Groups', 4),
  ('i5', 'icp', 'Use Cases & Proven Value', 5),
  -- Value Proposition & Messaging
  ('m1', 'messaging', 'Core Value Proposition', 1),
  ('m2', 'messaging', 'Persona-Specific Messaging', 2),
  ('m3', 'messaging', 'Pitch Scripts', 3),
  ('m4', 'messaging', 'Objection Handling Foundations', 4),
  ('m5', 'messaging', 'Product Capabilities & Customer Outcomes', 5),
  -- Sales Vocabulary & Buyer Language
  ('v1', 'vocabulary', 'Internal Sales Terminology', 1),
  ('v2', 'vocabulary', 'Buyer-Facing Terminology', 2),
  ('v3', 'vocabulary', 'Terms to Avoid & Correct Usage', 3),
  ('v4', 'vocabulary', 'Key Industry Terms', 4),
  ('v5', 'vocabulary', 'Correct Language Examples', 5),
  -- Qualification & Risk Assessment
  ('q1', 'qualification', 'Qualification Methodology', 1),
  ('q2', 'qualification', 'ICP Fit in Qualification', 2),
  ('q3', 'qualification', 'Risk Detection Guidance', 3),
  ('q4', 'qualification', 'Deal Health Flags', 4),
  ('q5', 'qualification', 'True Requirements vs Nice-to-Haves', 5),
  -- Sales Process & Meeting Sequences
  ('p1', 'process', 'Sales Process Overview', 1),
  ('p2', 'process', 'Stage Exit Criteria', 2),
  ('p3', 'process', 'Meeting Sequences', 3),
  ('p4', 'process', 'Process Best Practices & Examples', 4),
  ('p5', 'process', 'Common Mistakes & What Good Looks Like', 5),
  -- Discovery & Customer-Centric Questioning
  ('d1', 'discovery', 'Company-Specific Discovery Questions', 1),
  ('d2', 'discovery', 'Stakeholder Mapping Questions', 2),
  ('d3', 'discovery', 'Discovery-to-Value Connection', 3),
  ('d4', 'discovery', 'True Requirements Probing', 4),
  ('d5', 'discovery', 'Decision Process Uncovering', 5),
  -- Demo & Solution Fit
  ('dm1', 'demo', 'Demo Storyline & Sequence', 1),
  ('dm2', 'demo', 'Customer-Specific Demo Examples', 2),
  ('dm3', 'demo', 'Solution Fit Assessment', 3),
  ('dm4', 'demo', 'Persona-Based Demo Adaptation', 4),
  ('dm5', 'demo', 'Risk Areas & Humility', 5),
  -- Objection & Pricing Handling
  ('o1', 'objections', 'Context-Aware Objection Handling', 1),
  ('o2', 'objections', 'Persona-Specific Objection Patterns', 2),
  ('o3', 'objections', 'Pricing Question Guidelines', 3),
  ('o4', 'objections', 'Top Rep Response Examples', 4),
  ('o5', 'objections', 'Trust Preservation Do''s & Don''ts', 5),
  -- Tools, Tech Stack & Usage
  ('t1', 'tools', 'CRM Usage Rules & Fields', 1),
  ('t2', 'tools', 'Sales Engagement Tools', 2),
  ('t3', 'tools', 'Handover Processes', 3),
  ('t4', 'tools', 'Meeting Notes Standards', 4),
  ('t5', 'tools', 'Forecasting Expectations', 5),
  -- Opportunity Management & Deal Control
  ('dl1', 'deals', 'Mutual Commitment Checklists', 1),
  ('dl2', 'deals', 'Next-Step Control Techniques', 2),
  ('dl3', 'deals', 'Internal Alignment Playbook', 3),
  ('dl4', 'deals', 'Opportunity Prioritization', 4),
  ('dl5', 'deals', 'Decision Process Understanding', 5)
on conflict (id) do nothing;
