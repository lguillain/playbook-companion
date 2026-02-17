-- Backfill user_skills for existing users who are missing rows for newly added skills
INSERT INTO user_skills (user_id, skill_id, status)
SELECT p.id, s.id, 'missing'
FROM profiles p
CROSS JOIN skills s
ON CONFLICT DO NOTHING;
