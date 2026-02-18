-- Reverse an approved staged edit: revert section content and set status back to pending
create or replace function unapprove_staged_edit(edit_id uuid, reviewer_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_section_id uuid;
  v_before text;
  v_after text;
  v_current_content text;
begin
  select section_id, before_text, after_text
  into v_section_id, v_before, v_after
  from staged_edits
  where id = edit_id and status = 'approved'
  for update;

  if not found then
    raise exception 'Edit not found or not approved';
  end if;

  select content into v_current_content
  from playbook_sections
  where id = v_section_id
  for update;

  if v_before = '' then
    -- Was an append: remove the appended text
    update playbook_sections
    set content = replace(v_current_content, E'\n\n' || v_after, ''),
        last_updated = current_date
    where id = v_section_id;
  else
    -- Was a replace: swap after_text back to before_text
    update playbook_sections
    set content = replace(v_current_content, v_after, v_before),
        last_updated = current_date
    where id = v_section_id;
  end if;

  update staged_edits
  set status = 'pending',
      reviewed_by = null,
      reviewed_at = null
  where id = edit_id;
end;
$$;
