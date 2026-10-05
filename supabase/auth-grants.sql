-- Dedicated FRONTIERDOM Supabase project only; confirm real columns beforehand.
-- Needed for immediate server-side logout/deletion checks, not token decoding.
-- This service role must never be inherited by browser Auth roles.
grant usage on schema auth to frontierdom_backend;
grant select(id,user_id) on auth.sessions to frontierdom_backend;
