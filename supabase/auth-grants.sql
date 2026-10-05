-- Dedicated FRONTIERDOM Supabase project only; confirm real columns beforehand.
-- Needed for immediate server-side logout/deletion checks, not token decoding.
-- Hosted postgres has auth schema USAGE but cannot delegate it. Expose only
-- an exact session/user membership boolean from the private schema instead.
-- Apply as postgres; preserve that owner when restoring into a new database.
begin;
create or replace function frontierdom.auth_session_alive(session_id uuid, user_id uuid)
returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists(select 1 from auth.sessions s where s.id=$1 and s.user_id=$2);
$$;
alter function frontierdom.auth_session_alive(uuid,uuid) owner to postgres;
revoke all on function frontierdom.auth_session_alive(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function frontierdom.auth_session_alive(uuid,uuid) to frontierdom_backend;
-- Supersede the old direct-column grants; runtime cannot enumerate Auth rows.
revoke select(id,user_id) on auth.sessions from frontierdom_backend;
commit;
