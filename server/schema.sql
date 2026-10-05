-- Private, unexposed schema. Apply only to a dedicated FRONTIERDOM database.
-- This is a versioned bootstrap, not a Supabase migration history entry.
begin;
create schema if not exists frontierdom;
revoke all on schema frontierdom from public;
do $$ begin
  if not exists (select from pg_roles where rolname = 'frontierdom_backend') then
    create role frontierdom_backend nologin nosuperuser nobypassrls;
  end if;
end $$;

create table if not exists frontierdom.companies (
  id uuid primary key,
  state jsonb not null,
  command_count integer not null default 0 check (command_count between 0 and 1000),
  created_at timestamptz not null default now(),
  check (state->>'companyId' = id::text),
  check ((state->>'cashPence')::bigint between 0 and 9007199254740991),
  check ((state->>'revision')::bigint between 0 and 9007199254740991)
);
create table if not exists frontierdom.sessions (
  token_hash text primary key check (length(token_hash) = 64),
  company_id uuid not null unique references frontierdom.companies(id),
  expires_at timestamptz not null
);
create index if not exists sessions_expiry_idx on frontierdom.sessions(expires_at);
create table if not exists frontierdom.quotes (
  id uuid primary key,
  company_id uuid not null references frontierdom.companies(id),
  quote jsonb not null,
  expires_at timestamptz not null
);
create index if not exists quotes_company_expiry_idx on frontierdom.quotes(company_id, expires_at);
create table if not exists frontierdom.commands (
  company_id uuid not null references frontierdom.companies(id),
  command_id uuid not null,
  payload jsonb not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (company_id, command_id)
);
create table if not exists frontierdom.rate_buckets (
  key text primary key,
  window_id bigint not null,
  hits integer not null check (hits > 0),
  expires_at timestamptz not null
);
create index if not exists rate_expiry_idx on frontierdom.rate_buckets(expires_at);

grant usage on schema frontierdom to frontierdom_backend;
grant select, insert, update, delete on all tables in schema frontierdom to frontierdom_backend;
-- Only the trusted Node service role can use these policies. Browser Auth roles
-- have no schema/table grants and no policy; never grant them backend membership.
do $$ declare t text; r text; begin
  foreach t in array array['companies','sessions','quotes','commands','rate_buckets'] loop
    execute format('alter table frontierdom.%I enable row level security', t);
    execute format('alter table frontierdom.%I force row level security', t);
    execute format('revoke all on frontierdom.%I from public', t);
    execute format('drop policy if exists backend_only on frontierdom.%I', t);
    execute format('create policy backend_only on frontierdom.%I to frontierdom_backend using (true) with check (true)', t);
    foreach r in array array['anon','authenticated','service_role'] loop
      if exists (select from pg_roles where rolname = r) then
        execute format('revoke all on frontierdom.%I from %I', t, r);
      end if;
    end loop;
  end loop;
end $$;
commit;
