-- Ensure skill categories exist (needed for foreign key on fresh databases)
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

-- Add the 14 new skills to reach 5 per category (50 total)
-- These are inserted with "missing" status since they represent gaps

insert into skills (id, category_id, name, status, sort_order) values
  ('i5', 'icp', 'Use Cases & Proven Value', 'missing', 5),
  ('m5', 'messaging', 'Product Capabilities & Customer Outcomes', 'missing', 5),
  ('v4', 'vocabulary', 'Key Industry Terms', 'missing', 4),
  ('v5', 'vocabulary', 'Correct Language Examples', 'missing', 5),
  ('q5', 'qualification', 'True Requirements vs Nice-to-Haves', 'missing', 5),
  ('p5', 'process', 'Common Mistakes & What Good Looks Like', 'missing', 5),
  ('d4', 'discovery', 'True Requirements Probing', 'missing', 4),
  ('d5', 'discovery', 'Decision Process Uncovering', 'missing', 5),
  ('dm5', 'demo', 'Risk Areas & Humility', 'missing', 5),
  ('o5', 'objections', 'Trust Preservation Do''s & Don''ts', 'missing', 5),
  ('t4', 'tools', 'Meeting Notes Standards', 'missing', 4),
  ('t5', 'tools', 'Forecasting Expectations', 'missing', 5),
  ('dl4', 'deals', 'Opportunity Prioritization', 'missing', 4),
  ('dl5', 'deals', 'Decision Process Understanding', 'missing', 5)
on conflict (id) do nothing;
