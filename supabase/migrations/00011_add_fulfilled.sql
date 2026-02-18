-- Let users mark skills as fulfilled even if the system says partial/missing.
-- Tracks where our skill requirements may be overly strict.
alter table user_skills add column fulfilled boolean not null default false;
