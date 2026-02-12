-- Profiles (extends auth.users)
create table profiles (
  id uuid primary key references auth.users on delete cascade,
  full_name text not null default '',
  avatar_url text,
  role text not null default 'member',
  created_at timestamptz not null default now()
);

-- Skill categories
create table skill_categories (
  id text primary key,
  name text not null,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- Skills
create table skills (
  id text primary key,
  category_id text not null references skill_categories on delete cascade,
  name text not null,
  status text not null default 'missing' check (status in ('covered', 'partial', 'missing')),
  last_updated date,
  section_title text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

-- Playbook sections
create table playbook_sections (
  id text primary key,
  title text not null,
  content text not null default '',
  sort_order integer not null default 0,
  last_updated date not null default current_date,
  created_at timestamptz not null default now()
);

-- Junction: which skills a section covers
create table section_skills (
  section_id text not null references playbook_sections on delete cascade,
  skill_id text not null references skills on delete cascade,
  primary key (section_id, skill_id)
);

-- Staged edits
create table staged_edits (
  id uuid primary key default gen_random_uuid(),
  section_id text not null references playbook_sections on delete cascade,
  before_text text not null default '',
  after_text text not null default '',
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  source text check (source in ('chat', 'manual')),
  created_by uuid references auth.users,
  reviewed_by uuid references auth.users,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

-- Chat messages
create table chat_messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id text not null,
  role text not null check (role in ('user', 'assistant')),
  content text not null,
  section_id text references playbook_sections,
  created_by uuid references auth.users,
  created_at timestamptz not null default now()
);

create index idx_chat_messages_conversation on chat_messages (conversation_id, created_at);

-- Connections (OAuth tokens)
create table connections (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  access_token text not null,
  refresh_token text,
  workspace_id text,
  connected_by uuid references auth.users,
  created_at timestamptz not null default now()
);

-- Imports
create table imports (
  id uuid primary key default gen_random_uuid(),
  provider text not null,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  file_path text,
  metadata jsonb,
  started_by uuid references auth.users,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  error text
);

-- RLS: simple single-team policies — authenticated users can do everything
alter table profiles enable row level security;
alter table skill_categories enable row level security;
alter table skills enable row level security;
alter table playbook_sections enable row level security;
alter table section_skills enable row level security;
alter table staged_edits enable row level security;
alter table chat_messages enable row level security;
alter table connections enable row level security;
alter table imports enable row level security;

create policy "Authenticated read all" on profiles for select to authenticated using (true);
create policy "Authenticated update own" on profiles for update to authenticated using (id = auth.uid());

create policy "Authenticated full access" on skill_categories for all to authenticated using (true) with check (true);
create policy "Authenticated full access" on skills for all to authenticated using (true) with check (true);
create policy "Authenticated full access" on playbook_sections for all to authenticated using (true) with check (true);
create policy "Authenticated full access" on section_skills for all to authenticated using (true) with check (true);
create policy "Authenticated full access" on staged_edits for all to authenticated using (true) with check (true);
create policy "Authenticated full access" on chat_messages for all to authenticated using (true) with check (true);
create policy "Authenticated full access" on connections for all to authenticated using (true) with check (true);
create policy "Authenticated full access" on imports for all to authenticated using (true) with check (true);

-- DB function: approve a staged edit (atomically apply + mark approved)
create or replace function approve_staged_edit(edit_id uuid, reviewer_id uuid)
returns void
language plpgsql
security definer
as $$
declare
  v_section_id text;
  v_before text;
  v_after text;
  v_current_content text;
begin
  -- Lock and fetch the edit
  select section_id, before_text, after_text
  into v_section_id, v_before, v_after
  from staged_edits
  where id = edit_id and status = 'pending'
  for update;

  if not found then
    raise exception 'Edit not found or not pending';
  end if;

  -- Fetch current section content
  select content into v_current_content
  from playbook_sections
  where id = v_section_id
  for update;

  -- Apply: if before_text is empty, append; otherwise replace
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

  -- Mark edit as approved
  update staged_edits
  set status = 'approved',
      reviewed_by = reviewer_id,
      reviewed_at = now()
  where id = edit_id;
end;
$$;
