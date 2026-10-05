-- Additive Checkpoint B persistence. Isolated tests only until paired release.
begin;
create table if not exists frontierdom.encounters (
  id uuid primary key,
  company_id uuid not null unique references frontierdom.companies(id),
  departure_command_id uuid not null,
  source_revision integer not null check(source_revision>=0),
  seed bigint not null check(seed between 0 and 4294967295),
  frozen_input jsonb not null check(jsonb_typeof(frozen_input)='object' and octet_length(frozen_input::text)<=32768),
  status text not null check(status in ('awaiting_choice','active','resolved')),
  choice text check(choice in ('pay','drop','run','fight')),
  tick integer not null default 0 check(tick between 0 and 180),
  schedule jsonb not null default '[]' check(jsonb_typeof(schedule)='array' and jsonb_array_length(schedule)<=8 and octet_length(schedule::text)<=4096),
  continuation jsonb check(jsonb_typeof(continuation)='object' and octet_length(continuation::text)<=262144),
  result jsonb check(jsonb_typeof(result)='object' and octet_length(result::text)<=32768),
  check((status='resolved')=(result is not null)),
  unique(company_id,departure_command_id)
);
alter table frontierdom.encounters enable row level security;
alter table frontierdom.encounters force row level security;
revoke all on frontierdom.encounters from public,anon,authenticated,service_role;
grant select,insert,update on frontierdom.encounters to frontierdom_backend;
drop policy if exists backend_only on frontierdom.encounters;
create policy backend_only on frontierdom.encounters to frontierdom_backend using(true) with check(true);
commit;
