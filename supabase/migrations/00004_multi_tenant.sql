-- Multi-tenant: per-user data isolation
-- Each user gets their own playbook sections, skill statuses, edits, and connections.

-- ══════════════════════════════════════════════════════════════════════
-- 1. Create user_skills table (per-user skill status tracking)
-- ══════════════════════════════════════════════════════════════════════

create table user_skills (
  user_id uuid not null references auth.users on delete cascade,
  skill_id text not null references skills on delete cascade,
  status text not null default 'missing'
    check (status in ('covered', 'partial', 'missing')),
  last_updated date,
  section_title text,
  primary key (user_id, skill_id)
);

alter table user_skills enable row level security;

create policy "Users manage own skills"
  on user_skills for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- ══════════════════════════════════════════════════════════════════════
-- 2. Strip per-user columns from skills (make it definition-only)
-- ══════════════════════════════════════════════════════════════════════

alter table skills drop column if exists status;
alter table skills drop column if exists last_updated;
alter table skills drop column if exists section_title;

-- ══════════════════════════════════════════════════════════════════════
-- 3. Change playbook_sections.id from text to uuid, add user_id
-- ══════════════════════════════════════════════════════════════════════

-- Clear existing data (seed data only, no production data)
delete from section_skills;
delete from staged_edits;
update chat_messages set section_id = null where section_id is not null;
delete from playbook_sections;

-- Drop foreign keys that reference playbook_sections.id
alter table section_skills drop constraint section_skills_section_id_fkey;
alter table staged_edits drop constraint staged_edits_section_id_fkey;
alter table chat_messages drop constraint chat_messages_section_id_fkey;

-- Drop primary keys
alter table section_skills drop constraint section_skills_pkey;
alter table playbook_sections drop constraint playbook_sections_pkey;

-- Convert playbook_sections.id to uuid
alter table playbook_sections alter column id type uuid using gen_random_uuid();
alter table playbook_sections alter column id set default gen_random_uuid();
alter table playbook_sections add column user_id uuid not null default '00000000-0000-0000-0000-000000000000';
alter table playbook_sections alter column user_id drop default;
alter table playbook_sections add constraint playbook_sections_user_id_fkey
  foreign key (user_id) references auth.users on delete cascade;
alter table playbook_sections add primary key (id);

-- Convert section_skills.section_id to uuid, add user_id
alter table section_skills alter column section_id type uuid using gen_random_uuid();
alter table section_skills add column user_id uuid not null default '00000000-0000-0000-0000-000000000000';
alter table section_skills alter column user_id drop default;
alter table section_skills add constraint section_skills_user_id_fkey
  foreign key (user_id) references auth.users on delete cascade;
alter table section_skills add primary key (section_id, skill_id);
alter table section_skills add constraint section_skills_section_id_fkey
  foreign key (section_id) references playbook_sections(id) on delete cascade;

-- Convert staged_edits.section_id to uuid
alter table staged_edits alter column section_id type uuid using gen_random_uuid();
alter table staged_edits add constraint staged_edits_section_id_fkey
  foreign key (section_id) references playbook_sections(id) on delete cascade;

-- Convert chat_messages.section_id to uuid
alter table chat_messages alter column section_id type uuid using null::uuid;
alter table chat_messages add constraint chat_messages_section_id_fkey
  foreign key (section_id) references playbook_sections(id);

-- ══════════════════════════════════════════════════════════════════════
-- 4. Update RLS policies
-- ══════════════════════════════════════════════════════════════════════

-- playbook_sections
drop policy "Authenticated full access" on playbook_sections;
create policy "Users manage own sections"
  on playbook_sections for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- section_skills
drop policy "Authenticated full access" on section_skills;
create policy "Users manage own section_skills"
  on section_skills for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- staged_edits
drop policy "Authenticated full access" on staged_edits;
create policy "Users manage own edits"
  on staged_edits for all to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

-- chat_messages
drop policy "Authenticated full access" on chat_messages;
create policy "Users manage own messages"
  on chat_messages for all to authenticated
  using (created_by = auth.uid())
  with check (created_by = auth.uid());

-- connections
drop policy "Authenticated full access" on connections;
create policy "Users manage own connections"
  on connections for all to authenticated
  using (connected_by = auth.uid())
  with check (connected_by = auth.uid());

-- imports
drop policy "Authenticated full access" on imports;
create policy "Users manage own imports"
  on imports for all to authenticated
  using (started_by = auth.uid())
  with check (started_by = auth.uid());

-- skill_categories and skills remain globally readable (unchanged)

-- ══════════════════════════════════════════════════════════════════════
-- 5. Update handle_new_user() trigger to seed user_skills
-- ══════════════════════════════════════════════════════════════════════

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, full_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.raw_user_meta_data ->> 'avatar_url'
  );

  -- Seed user_skills with all skills as "missing"
  insert into public.user_skills (user_id, skill_id, status)
  select new.id, s.id, 'missing'
  from public.skills s;

  return new;
end;
$$;

-- ══════════════════════════════════════════════════════════════════════
-- 6. Backfill user_skills for existing users
-- ══════════════════════════════════════════════════════════════════════

insert into user_skills (user_id, skill_id, status)
select p.id, s.id, 'missing'
from profiles p
cross join skills s
on conflict do nothing;

-- ══════════════════════════════════════════════════════════════════════
-- 7. Re-create approve_staged_edit (section_id type changed to uuid)
-- ══════════════════════════════════════════════════════════════════════

create or replace function approve_staged_edit(edit_id uuid, reviewer_id uuid)
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
  where id = edit_id and status = 'pending'
  for update;

  if not found then
    raise exception 'Edit not found or not pending';
  end if;

  select content into v_current_content
  from playbook_sections
  where id = v_section_id
  for update;

  if v_before = '' then
    update playbook_sections
    set content = v_current_content || E'\n\n' || v_after,
        last_updated = current_date
    where id = v_section_id;
  else
    update playbook_sections
    set content = replace(v_current_content, v_before, v_after),
        last_updated = current_date
    where id = v_section_id;
  end if;

  update staged_edits
  set status = 'approved',
      reviewed_by = reviewer_id,
      reviewed_at = now()
  where id = edit_id;
end;
$$;
