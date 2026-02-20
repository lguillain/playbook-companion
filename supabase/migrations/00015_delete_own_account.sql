-- Allow a user to delete their own account (profile + auth record).
-- Intended for waitlisted users who want to leave the waitlist.

create or replace function public.delete_own_account()
returns void
language plpgsql
security definer set search_path = ''
as $$
begin
  -- Delete profile (cascades to user_skills etc. via FK)
  delete from public.profiles where id = auth.uid();

  -- Delete auth user
  delete from auth.users where id = auth.uid();
end;
$$;
