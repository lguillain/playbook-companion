-- Add provider column to playbook_sections so each import source
-- only replaces its own sections instead of wiping everything.

alter table playbook_sections
  add column provider text not null default 'pdf';

-- Backfill existing rows: look at the most recent completed import
-- for each user to determine the provider. Falls back to 'pdf'.
update playbook_sections ps
set provider = coalesce(
  (
    select i.provider
    from imports i
    where i.started_by = ps.user_id
      and i.status = 'completed'
    order by i.completed_at desc nulls last
    limit 1
  ),
  'pdf'
);

-- Index for scoped deletes: delete by (user_id, provider)
create index idx_playbook_sections_user_provider
  on playbook_sections (user_id, provider);
