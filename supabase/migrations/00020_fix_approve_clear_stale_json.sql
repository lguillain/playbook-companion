-- Fix approve_staged_edit: clear content_json when after_json is NULL
-- instead of keeping stale JSON via COALESCE. This ensures TipTapViewer
-- falls back to the (correctly updated) text content field.

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
  -- Set content_json = v_after_json directly (NULL when not provided),
  -- so TipTapViewer falls back to the updated text content.
  IF v_before = '' THEN
    UPDATE playbook_sections
    SET content = v_current_content || E'\n\n' || v_after,
        content_json = v_after_json,
        last_updated = CURRENT_DATE
    WHERE id = v_section_id;
  ELSE
    UPDATE playbook_sections
    SET content = REPLACE(v_current_content, v_before, v_after),
        content_json = v_after_json,
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
