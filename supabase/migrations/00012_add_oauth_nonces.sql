-- Table to store OAuth nonces for CSRF protection during OAuth callbacks.
-- Nonces are single-use and should be cleaned up after use or expiry.

create table if not exists public.oauth_nonces (
  id uuid primary key default gen_random_uuid(),
  nonce text not null unique,
  user_id uuid not null references auth.users(id) on delete cascade,
  provider text not null,
  created_at timestamptz not null default now()
);

-- Auto-delete nonces older than 10 minutes (stale OAuth flows)
-- Run periodically via pg_cron or application-level cleanup.

-- Index for fast lookup during callback validation
create index if not exists idx_oauth_nonces_lookup on public.oauth_nonces (nonce, user_id, provider);

-- No RLS needed — this table is only accessed by edge functions using the service role key.
