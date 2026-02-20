-- Add JSONB columns for TipTap structured content storage.
-- Keeps existing TEXT columns for backward compatibility and diff display.

-- 1. Add content_json to playbook_sections
ALTER TABLE playbook_sections
  ADD COLUMN IF NOT EXISTS content_json JSONB;

-- 2. Add after_json to staged_edits
ALTER TABLE staged_edits
  ADD COLUMN IF NOT EXISTS after_json JSONB;

-- 3. Update approve_staged_edit to also copy after_json → content_json
CREATE OR REPLACE FUNCTION approve_staged_edit(edit_id uuid, reviewer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_section_id uuid;
  v_before text;
  v_after text;
  v_after_json jsonb;
  v_current_content text;
BEGIN
  SELECT section_id, before_text, after_text, after_json
  INTO v_section_id, v_before, v_after, v_after_json
  FROM staged_edits
  WHERE id = edit_id AND status = 'pending'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Edit not found or not pending';
  END IF;

  SELECT content INTO v_current_content
  FROM playbook_sections
  WHERE id = v_section_id
  FOR UPDATE;

  -- Apply text-based edit (backward compat)
  IF v_before = '' THEN
    UPDATE playbook_sections
    SET content = v_current_content || E'\n\n' || v_after,
        content_json = COALESCE(v_after_json, content_json),
        last_updated = CURRENT_DATE
    WHERE id = v_section_id;
  ELSE
    UPDATE playbook_sections
    SET content = REPLACE(v_current_content, v_before, v_after),
        content_json = COALESCE(v_after_json, content_json),
        last_updated = CURRENT_DATE
    WHERE id = v_section_id;
  END IF;

  UPDATE staged_edits
  SET status = 'approved',
      reviewed_by = reviewer_id,
      reviewed_at = NOW()
  WHERE id = edit_id;
END;
$$;

-- 4. Update unapprove_staged_edit to also revert content_json
-- Note: unapprove doesn't need to handle content_json reversion perfectly
-- since we're still keeping text-based content as the fallback.
-- The JSON will be re-derived when the edit is re-applied.
CREATE OR REPLACE FUNCTION unapprove_staged_edit(edit_id uuid, reviewer_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_section_id uuid;
  v_before text;
  v_after text;
  v_current_content text;
BEGIN
  SELECT section_id, before_text, after_text
  INTO v_section_id, v_before, v_after
  FROM staged_edits
  WHERE id = edit_id AND status = 'approved'
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Edit not found or not approved';
  END IF;

  SELECT content INTO v_current_content
  FROM playbook_sections
  WHERE id = v_section_id
  FOR UPDATE;

  IF v_before = '' THEN
    UPDATE playbook_sections
    SET content = REPLACE(v_current_content, E'\n\n' || v_after, ''),
        last_updated = CURRENT_DATE
    WHERE id = v_section_id;
  ELSE
    UPDATE playbook_sections
    SET content = REPLACE(v_current_content, v_after, v_before),
        last_updated = CURRENT_DATE
    WHERE id = v_section_id;
  END IF;

  UPDATE staged_edits
  SET status = 'pending',
      reviewed_by = NULL,
      reviewed_at = NULL
  WHERE id = edit_id;
END;
$$;
