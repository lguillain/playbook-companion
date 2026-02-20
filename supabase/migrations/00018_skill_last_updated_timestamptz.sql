-- Change user_skills.last_updated from date to timestamptz
-- so section dates are stored with full precision.
alter table user_skills
  alter column last_updated type timestamptz using last_updated::timestamptz;

-- Track when the skill analysis was last run (separate from section content dates).
alter table profiles
  add column analyzed_at timestamptz;
