begin;
alter table public.tenant_issues add column if not exists workflow_status text not null default 'open';
create table if not exists public.tenant_issue_replies (
 id uuid primary key default gen_random_uuid(), issue_id uuid not null references public.tenant_issues(id) on delete cascade,
 author_id uuid not null default auth.uid(), author_role text not null check(author_role in ('tenant','landlord')),
 message text not null check(length(trim(message)) between 1 and 4000), created_at timestamptz not null default now()
);
create index if not exists tenant_issue_replies_issue on public.tenant_issue_replies(issue_id,created_at);
alter table public.tenant_issue_replies enable row level security;
drop policy if exists issue_replies_read on public.tenant_issue_replies;
create policy issue_replies_read on public.tenant_issue_replies for select to authenticated using
 (exists(select 1 from public.tenant_issues i where i.id=issue_id and public.rentozi_tenant_access(i.tenant_id)));
grant select on public.tenant_issue_replies to authenticated;
revoke all on public.tenant_issue_replies from anon;
revoke insert,update,delete on public.tenant_issue_replies from authenticated;
create or replace function public.rentozi_reply_issue(p_issue text,p_message text,p_status text default null) returns void
language plpgsql security definer set search_path=public,pg_temp as $$
declare issue public.tenant_issues; manager boolean;
begin
 if not public.rentozi_user_enabled() then raise exception 'Account access disabled'; end if;
 select * into issue from public.tenant_issues where id::text=p_issue for update;
 if not found or not public.rentozi_tenant_access(issue.tenant_id) then raise exception 'Issue unavailable'; end if;
 manager:=public.rentozi_tenant_access(issue.tenant_id,true);
 if p_status is not null and (not manager or p_status not in ('open','in_progress','resolved')) then raise exception 'Only the property manager may change issue status'; end if;
 if length(trim(coalesce(p_message,''))) not between 1 and 4000 then raise exception 'Enter a reply of up to 4000 characters'; end if;
 insert into public.tenant_issue_replies(issue_id,author_id,author_role,message) values(issue.id,auth.uid(),case when manager then 'landlord' else 'tenant' end,trim(p_message));
 if p_status is not null then update public.tenant_issues set workflow_status=p_status where id=issue.id; end if;
end $$;
revoke all on function public.rentozi_reply_issue(text,text,text) from public;
grant execute on function public.rentozi_reply_issue(text,text,text) to authenticated;
commit;
