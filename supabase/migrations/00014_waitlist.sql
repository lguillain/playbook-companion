-- Add waitlist status to profiles and cap external users at 10

-- 1. Add status column
alter table profiles
  add column status text not null default 'waitlisted'
  check (status in ('active', 'waitlisted'));

-- 2. Backfill all existing users to active
update profiles set status = 'active';

-- 3. Update handle_new_user() trigger to assign status based on email
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
declare
  _status text;
  _external_active_count int;
begin
  -- Taskbase emails always get active status
  if new.email like '%@taskbase.com' then
    _status := 'active';
  else
    -- Count active non-taskbase profiles
    select count(*) into _external_active_count
    from public.profiles p
    join auth.users u on u.id = p.id
    where p.status = 'active'
      and u.email not like '%@taskbase.com';

    if _external_active_count < 10 then
      _status := 'active';
    else
      _status := 'waitlisted';
    end if;
  end if;

  insert into public.profiles (id, full_name, avatar_url, status)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', ''),
    new.raw_user_meta_data ->> 'avatar_url',
    _status
  );

  -- Seed user_skills with all skills as "missing"
  insert into public.user_skills (user_id, skill_id, status)
  select new.id, s.id, 'missing'
  from public.skills s;

  return new;
end;
$$;

-- 4. Admin helper: activate a waitlisted user by email
--    Usage: select activate_waitlisted_user('someone@example.com');
create or replace function public.activate_waitlisted_user(_email text)
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  update public.profiles
  set status = 'active'
  where id = (select id from auth.users where email = _email)
    and status = 'waitlisted';

  if not found then
    raise exception 'No waitlisted user found with email %', _email;
  end if;
end;
$$;
