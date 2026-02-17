-- Track which Confluence/Notion page each section came from,
-- enabling reassembly at publish time.
ALTER TABLE playbook_sections
  ADD COLUMN source_page_id TEXT;
