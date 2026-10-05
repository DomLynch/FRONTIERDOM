-- Additive account extension; apply after schema.sql to the dedicated project.
begin;
alter table frontierdom.companies add column if not exists auth_user_id uuid unique;
-- Multiple verified browser sessions may own the same account's one company.
alter table frontierdom.sessions drop constraint if exists sessions_company_id_key;
create index if not exists sessions_company_idx on frontierdom.sessions(company_id);
create table if not exists frontierdom.oauth_flows (
  token_hash text primary key check(length(token_hash)=64),
  sealed_storage text not null check(length(sealed_storage)<=65536),
  previous_token_hash text,
  expires_at timestamptz not null
);
create index if not exists oauth_expiry_idx on frontierdom.oauth_flows(expires_at);
create table if not exists frontierdom.account_sessions (
  token_hash text primary key check(length(token_hash)=64),
  auth_user_id uuid not null,
  auth_session_id uuid not null,
  sealed_storage text not null check(length(sealed_storage)<=65536),
  expires_at timestamptz not null
);
create index if not exists account_user_idx on frontierdom.account_sessions(auth_user_id);
create index if not exists account_expiry_idx on frontierdom.account_sessions(expires_at);
grant select,insert,update,delete on frontierdom.oauth_flows,frontierdom.account_sessions to frontierdom_backend;
do $$ declare t text; r text; begin
  foreach t in array array['oauth_flows','account_sessions'] loop
    execute format('alter table frontierdom.%I enable row level security',t);
    execute format('alter table frontierdom.%I force row level security',t);
    execute format('revoke all on frontierdom.%I from public',t);
    execute format('drop policy if exists backend_only on frontierdom.%I',t);
    execute format('create policy backend_only on frontierdom.%I to frontierdom_backend using(true) with check(true)',t);
    foreach r in array array['anon','authenticated','service_role'] loop
      if exists(select from pg_roles where rolname=r) then execute format('revoke all on frontierdom.%I from %I',t,r); end if;
    end loop;
  end loop;
end $$;
commit;
