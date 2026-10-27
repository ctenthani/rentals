begin;
create table if not exists public.rentozi_reminder_runs(
 id uuid primary key,
 started_at timestamptz not null default now(),
 finished_at timestamptz,
 status text not null check(status in ('running','completed','partial','failed')),
 summary jsonb,
 error text
);
alter table public.rentozi_reminder_runs enable row level security;
revoke all on public.rentozi_reminder_runs from public,anon,authenticated;
grant select on public.rentozi_reminder_runs to authenticated;
grant all on public.rentozi_reminder_runs to service_role;
drop policy if exists reminder_runs_owner_read on public.rentozi_reminder_runs;
create policy reminder_runs_owner_read on public.rentozi_reminder_runs for select to authenticated using(public.rentozi_is_platform_owner());
commit;
