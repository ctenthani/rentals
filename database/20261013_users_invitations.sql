begin;
create table if not exists public.rentozi_platform_owners(user_id uuid primary key);
insert into public.rentozi_platform_owners select id from auth.users where lower(email) in ('ctenthani@gmail.com','ctenthani@mubas.ac.mw') and email_confirmed_at is not null on conflict do nothing;
create table if not exists public.rentozi_user_controls(user_id uuid primary key,disabled boolean not null default false,reason text,changed_by uuid,changed_at timestamptz default now());
create table if not exists public.rentozi_admin_events(id bigint generated always as identity primary key,actor uuid,target uuid,action text,details jsonb,created_at timestamptz default now());
create table if not exists public.rentozi_invitations(id uuid primary key default gen_random_uuid(),kind text not null check(kind in ('tenant','manager','landlord')),target_id uuid,email text not null,full_name text,business_name text,created_by uuid not null,status text not null default 'pending',created_at timestamptz default now(),expires_at timestamptz default now()+interval '7 days',sent_at timestamptz,delivery_error text,accepted_by uuid,accepted_at timestamptz);
create table if not exists public.rentozi_email_log(id bigint generated always as identity primary key,actor_id uuid,recipient text,subject text,status text,provider_id text,error text,created_at timestamptz default now());
do $$ declare name text; begin foreach name in array array['rentozi_platform_owners','rentozi_user_controls','rentozi_admin_events','rentozi_invitations','rentozi_email_log'] loop execute format('alter table public.%I enable row level security',name);execute format('revoke all on public.%I from public,anon,authenticated',name);execute format('grant all on public.%I to service_role',name);end loop;end $$;
grant usage,select on sequence public.rentozi_admin_events_id_seq,public.rentozi_email_log_id_seq to service_role;
create or replace function public.rentozi_user_enabled(p_user uuid default auth.uid()) returns boolean language sql stable security definer set search_path=public,pg_temp as $$ select p_user is not null and not exists(select 1 from rentozi_user_controls where user_id=p_user and disabled) $$;
create or replace function public.rentozi_is_platform_owner() returns boolean language sql stable security definer set search_path=public,pg_temp as $$ select rentozi_user_enabled() and exists(select 1 from rentozi_platform_owners where user_id=auth.uid()) $$;
create or replace function public.rentozi_set_user_access(p_user uuid,p_enabled boolean,p_reason text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ begin
 if not rentozi_is_platform_owner() then raise exception using errcode='42501',message='Only the platform owner can manage users';end if;
 if p_user=auth.uid() or exists(select 1 from rentozi_platform_owners where user_id=p_user) then raise exception 'Owner logins are protected. Remove a tenant role separately.';end if;
 if not exists(select 1 from auth.users where id=p_user) then raise exception 'User does not exist';end if;
 if length(trim(coalesce(p_reason,'')))<3 then raise exception 'Enter a reason';end if;
 insert into rentozi_user_controls(user_id,disabled,reason,changed_by,changed_at) values(p_user,not p_enabled,left(p_reason,500),auth.uid(),now()) on conflict(user_id) do update set disabled=excluded.disabled,reason=excluded.reason,changed_by=excluded.changed_by,changed_at=excluded.changed_at;
 insert into rentozi_admin_events(actor,target,action,details) values(auth.uid(),p_user,case when p_enabled then 'restore_access' else 'remove_access' end,jsonb_build_object('reason',left(p_reason,500)));
 return jsonb_build_object('success',true);end $$;
create or replace function public.rentozi_remove_my_tenant_role(p_tenant uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ begin
 if not rentozi_is_platform_owner() then raise exception using errcode='42501',message='Only the platform owner can use this test-profile cleanup';end if;
 update tenants set auth_user_id=null,is_active=false where id=p_tenant and auth_user_id=auth.uid();
 if not found then raise exception 'This tenant profile is not linked to your login';end if;
 insert into rentozi_admin_events(actor,target,action,details) values(auth.uid(),auth.uid(),'remove_own_tenant_role',jsonb_build_object('tenant_id',p_tenant));
 return jsonb_build_object('success',true,'preserved_history',true);end $$;
create or replace function public.rentozi_auth_user_id(p_email text) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$ declare result uuid;begin
 if auth.role()<>'service_role' then raise exception using errcode='42501',message='Server only';end if;
 select id into result from auth.users where lower(email)=lower(trim(p_email));return result;end $$;
create or replace function public.rentozi_unused_user(p_user uuid) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$ declare c record;used boolean;begin
 if not rentozi_is_platform_owner() then raise exception using errcode='42501',message='Owner only';end if;
 if p_user=auth.uid() or exists(select 1 from rentozi_platform_owners where user_id=p_user) then return false;end if;
 if exists(select 1 from tenants where auth_user_id=p_user) or exists(select 1 from landlords where auth_user_id=p_user) or exists(select 1 from landlord_members where auth_user_id=p_user) then return false;end if;
 for c in select n.nspname,t.relname,a.attname from pg_constraint k join pg_class t on t.oid=k.conrelid join pg_namespace n on n.oid=t.relnamespace join pg_attribute a on a.attrelid=t.oid and a.attnum=k.conkey[1] where k.contype='f' and k.confrelid='auth.users'::regclass and n.nspname='public' loop
 execute format('select exists(select 1 from %I.%I where %I=$1)',c.nspname,c.relname,c.attname) into used using p_user;if used then return false;end if;end loop;
 return true;end $$;
-- Restrictive policies also block an already-issued session immediately after access removal.
do $$ declare name text; begin foreach name in array array['houses','tenants','leases','payments','payment_submissions','tenant_balances','landlords','landlord_members','tenant_issues'] loop
 execute format('drop policy if exists rentozi_enabled_only on public.%I',name);
 execute format('create policy rentozi_enabled_only on public.%I as restrictive for all to authenticated using(public.rentozi_user_enabled()) with check(public.rentozi_user_enabled())',name);end loop;end $$;
create or replace function public.rentozi_manages(p_landlord uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$ select rentozi_user_enabled() and exists(select 1 from landlords l where l.id=p_landlord and (l.auth_user_id=auth.uid() or exists(select 1 from landlord_members m where m.landlord_id=l.id and m.auth_user_id=auth.uid() and m.role='manager'))) $$;
create or replace function public.rentozi_tenant_access(p_tenant uuid,p_manage boolean default false) returns boolean language sql stable security definer set search_path=public,pg_temp as $$ select rentozi_user_enabled() and exists(select 1 from tenants t where t.id=p_tenant and (rentozi_manages(t.landlord_id) or (not p_manage and t.auth_user_id=auth.uid()))) $$;
create or replace function public.rentozi_owns_landlord(p_landlord uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$ select rentozi_user_enabled() and exists(select 1 from landlords where id=p_landlord and auth_user_id=auth.uid()) $$;
create or replace function public.rentozi_landlord_access(p_landlord uuid) returns boolean language sql stable security definer set search_path=public,pg_temp as $$ select rentozi_user_enabled() and (rentozi_manages(p_landlord) or exists(select 1 from tenants where landlord_id=p_landlord and auth_user_id=auth.uid())) $$;
create or replace function public.rentozi_prepare_invitation(p_kind text,p_target uuid,p_email text,p_name text,p_business text default null) returns uuid language plpgsql security definer set search_path=public,pg_temp as $$ declare result uuid;t tenants%rowtype;counted integer; begin
 if not rentozi_user_enabled() then raise exception using errcode='42501',message='Sign in with an active account';end if;
 p_email:=lower(trim(p_email));if p_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'Enter a valid email';end if;
 if p_kind='tenant' then select * into t from tenants where id=p_target;if not found or not rentozi_tenant_access(p_target,true) then raise exception using errcode='42501',message='Manage this tenant before inviting';end if;
 if lower(trim(coalesce(t.email,'')))<>p_email then raise exception 'Save this email on the tenant record first';end if;
 if t.auth_user_id is not null and not exists(select 1 from auth.users where id=t.auth_user_id and lower(email)=p_email) then raise exception 'This tenant is linked to another login. Resolve that link before inviting.';end if;
 elsif p_kind='manager' then if not rentozi_owns_landlord(p_target) then raise exception using errcode='42501',message='Only the business owner can invite managers';end if;
 elsif p_kind='landlord' then if not rentozi_is_platform_owner() then raise exception using errcode='42501',message='Only the platform owner can invite landlords';end if;
 else raise exception 'Invalid invitation type';end if;
 perform pg_advisory_xact_lock(hashtextextended(p_kind||coalesce(p_target::text,'')||p_email,0));
 if exists(select 1 from rentozi_invitations where kind=p_kind and target_id is not distinct from p_target and email=p_email and created_at>now()-interval '60 seconds') then raise exception 'Wait one minute before sending another invitation';end if;
 insert into rentozi_email_limits(actor_id,hour,count) values(auth.uid(),date_trunc('hour',now()),1) on conflict(actor_id,hour) do update set count=rentozi_email_limits.count+1 returning count into counted;if counted>30 then raise exception 'Hourly email limit reached';end if;
 update rentozi_invitations set status='superseded' where kind=p_kind and target_id is not distinct from p_target and email=p_email and status='pending';
 insert into rentozi_invitations(kind,target_id,email,full_name,business_name,created_by) values(p_kind,p_target,p_email,left(p_name,200),left(p_business,200),auth.uid()) returning id into result;return result;end $$;
create or replace function public.rentozi_invitation_details(p_invitation uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ declare i rentozi_invitations%rowtype;begin
 select * into i from rentozi_invitations where id=p_invitation and email=(select lower(email) from auth.users where id=auth.uid());
 if not found or not rentozi_user_enabled() then raise exception using errcode='42501',message='Sign in using the email that received this invitation';end if;
 return jsonb_build_object('kind',i.kind,'email',i.email,'status',i.status,'expires_at',i.expires_at);end $$;
create or replace function public.rentozi_accept_invitation(p_invitation uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ declare i rentozi_invitations%rowtype;begin
 if not rentozi_user_enabled() or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then raise exception using errcode='42501',message='Verify your email first';end if;
 select * into i from rentozi_invitations where id=p_invitation for update;
 if not found or i.email<>(select lower(email) from auth.users where id=auth.uid()) then raise exception using errcode='42501',message='This invitation belongs to another email';end if;
 if i.status='accepted' and i.accepted_by=auth.uid() then return jsonb_build_object('success',true);end if;
 if i.status<>'pending' or i.expires_at<now() or not rentozi_user_enabled(i.created_by) then raise exception 'Invitation expired or withdrawn. Ask for a new one.';end if;
 if i.kind='tenant' then
 if not exists(select 1 from tenants t join landlords l on l.id=t.landlord_id where t.id=i.target_id and lower(trim(t.email))=i.email and (l.auth_user_id=i.created_by or exists(select 1 from landlord_members m where m.landlord_id=l.id and m.auth_user_id=i.created_by and m.role='manager'))) then raise exception 'Tenant or invitation ownership changed';end if;
 update tenants set auth_user_id=auth.uid() where id=i.target_id and (auth_user_id is null or auth_user_id=auth.uid());if not found then raise exception 'Another login is already linked';end if;
 elsif i.kind='manager' then
 if not exists(select 1 from landlords where id=i.target_id and auth_user_id=i.created_by) then raise exception 'Business ownership changed';end if;
 insert into landlord_members(landlord_id,auth_user_id,email,role) values(i.target_id,auth.uid(),i.email,'manager') on conflict(landlord_id,auth_user_id) do nothing;
 else
 if not exists(select 1 from rentozi_platform_owners where user_id=i.created_by) then raise exception 'Owner invitation withdrawn';end if;
 insert into landlords(auth_user_id,email,full_name,business_name) values(auth.uid(),i.email,i.full_name,coalesce(nullif(i.business_name,''),'My Rentals')) on conflict(auth_user_id) do nothing;
 end if;
 update rentozi_invitations set status='accepted',accepted_at=now(),accepted_by=auth.uid() where id=i.id;
 return jsonb_build_object('success',true,'destination',case when i.kind='tenant' then '/tenant' else '/dashboard' end);end $$;
do $$ declare f record;begin for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('rentozi_user_enabled','rentozi_is_platform_owner','rentozi_set_user_access','rentozi_remove_my_tenant_role','rentozi_unused_user','rentozi_prepare_invitation','rentozi_invitation_details','rentozi_accept_invitation') loop execute format('revoke all on function %s from public,anon',f.signature);execute format('grant execute on function %s to authenticated,service_role',f.signature);end loop;end $$;
revoke all on function public.rentozi_auth_user_id(text) from public,anon,authenticated;grant execute on function public.rentozi_auth_user_id(text) to service_role;

create or replace function public.rentozi_enabled_write_guard() returns trigger language plpgsql security definer set search_path=public,pg_temp as $$ begin
 if auth.role()='authenticated' and not rentozi_user_enabled() then raise exception using errcode='42501',message='This account has been removed. Contact the site owner.';end if;
 if tg_op='DELETE' then return old;else return new;end if;end $$;
do $$ declare name text;begin foreach name in array array['houses','tenants','leases','payments','payment_submissions','tenant_balances','landlords','landlord_members','tenant_issues'] loop execute format('drop trigger if exists rentozi_enabled_write on public.%I',name);execute format('create trigger rentozi_enabled_write before insert or update or delete on public.%I for each row execute function public.rentozi_enabled_write_guard()',name);end loop;end $$;
create table if not exists public.rentozi_auth_mail_limits(key text,bucket_start timestamptz,count integer,last_sent timestamptz,primary key(key,bucket_start));
alter table public.rentozi_auth_mail_limits enable row level security;revoke all on public.rentozi_auth_mail_limits from public,anon,authenticated;grant all on public.rentozi_auth_mail_limits to service_role;
create or replace function public.rentozi_claim_auth_mail(p_email_hash text,p_ip_hash text) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$ declare k text;c integer;previous timestamptz;bucket timestamptz:=date_trunc('hour',now());limit_value integer;begin
 if auth.role()<>'service_role' then raise exception using errcode='42501',message='Server only';end if;
 if p_email_hash !~ '^[0-9a-f]{64}$' or p_ip_hash !~ '^[0-9a-f]{64}$' then return false;end if;
 foreach k in array array['email:'||p_email_hash,'ip:'||p_ip_hash,'all'] loop
 select last_sent into previous from rentozi_auth_mail_limits where key=k and bucket_start=bucket for update;
 if k like 'email:%' and previous>now()-interval '60 seconds' then return false;end if;
 insert into rentozi_auth_mail_limits(key,bucket_start,count,last_sent) values(k,bucket,1,now()) on conflict(key,bucket_start) do update set count=rentozi_auth_mail_limits.count+1,last_sent=now() returning count into c;
 limit_value:=case when k like 'email:%' then 3 when k like 'ip:%' then 10 else 30 end;if c>limit_value then return false;end if;
 end loop;return true;end $$;
revoke all on function public.rentozi_claim_auth_mail(text,text) from public,anon,authenticated;grant execute on function public.rentozi_claim_auth_mail(text,text) to service_role;

create or replace function public.rentozi_save_tenant_email(p_tenant uuid,p_email text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ declare t tenants%rowtype;begin
 if not rentozi_tenant_access(p_tenant,true) then raise exception using errcode='42501',message='Manage this tenant before editing';end if;
 p_email:=lower(trim(p_email));if p_email !~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$' then raise exception 'Enter a valid email';end if;
 select * into t from tenants where id=p_tenant for update;
 if t.auth_user_id is not null and not exists(select 1 from auth.users where id=t.auth_user_id and lower(email)=p_email) then raise exception 'The linked user must change their own login email. This profile is linked to another address.';end if;
 update tenants set email=p_email where id=p_tenant;return jsonb_build_object('success',true);end $$;
revoke all on function public.rentozi_save_tenant_email(uuid,text) from public,anon;grant execute on function public.rentozi_save_tenant_email(uuid,text) to authenticated,service_role;
revoke all on function public.invite_landlord_member(text) from public,anon,authenticated;
create or replace function public.rentozi_email_recipient(p_email text) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$ declare n integer;cap integer;begin
 if not rentozi_user_enabled() then return false;end if;
 if not ((rentozi_is_platform_owner() and lower(trim(p_email))=(select lower(email) from auth.users where id=auth.uid())) or exists(select 1 from landlords l where rentozi_manages(l.id) and lower(trim(l.email))=lower(trim(p_email))) or exists(select 1 from tenants t join landlords l on l.id=t.landlord_id where (rentozi_manages(l.id) and lower(trim(t.email))=lower(trim(p_email))) or (t.auth_user_id=auth.uid() and lower(trim(l.email))=lower(trim(p_email))))) then return false;end if;
 cap:=case when rentozi_is_platform_owner() or exists(select 1 from landlords l where rentozi_manages(l.id)) then 100 else 10 end;
 insert into rentozi_email_limits(actor_id,hour,count) values(auth.uid(),date_trunc('hour',now()),1) on conflict(actor_id,hour) do update set count=rentozi_email_limits.count+1 returning count into n;return n<=cap;end $$;
create table if not exists public.rentozi_reminder_jobs(tenant_id uuid,due_date date,days_before integer,claimed_at timestamptz not null,sent_at timestamptz,error text,primary key(tenant_id,due_date,days_before));
alter table public.rentozi_reminder_jobs enable row level security;revoke all on public.rentozi_reminder_jobs from public,anon,authenticated;grant all on public.rentozi_reminder_jobs to service_role;
create or replace function public.rentozi_claim_reminder(p_tenant uuid,p_due date,p_days integer) returns boolean language plpgsql security definer set search_path=public,pg_temp as $$ declare won uuid;begin
 if auth.role()<>'service_role' then raise exception using errcode='42501',message='Server only';end if;
 insert into rentozi_reminder_jobs(tenant_id,due_date,days_before,claimed_at) values(p_tenant,p_due,p_days,now()) on conflict(tenant_id,due_date,days_before) do update set claimed_at=now() where rentozi_reminder_jobs.sent_at is null and rentozi_reminder_jobs.claimed_at<now()-interval '60 seconds' returning tenant_id into won;return won is not null;end $$;
revoke all on function public.rentozi_claim_reminder(uuid,date,integer) from public,anon,authenticated;grant execute on function public.rentozi_claim_reminder(uuid,date,integer) to service_role;
create or replace function public.rentozi_detach_tenant_login(p_tenant uuid,p_user uuid,p_reason text) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ begin
 if not rentozi_is_platform_owner() then raise exception using errcode='42501',message='Site owner only';end if;
 if not exists(select 1 from rentozi_user_controls where user_id=p_user and disabled) then raise exception 'Remove the incorrect login’s access before unlinking it';end if;
 if length(trim(coalesce(p_reason,'')))<3 then raise exception 'Enter a reason';end if;
 update tenants set auth_user_id=null where id=p_tenant and auth_user_id=p_user;if not found then raise exception 'This tenant is not linked to the selected user';end if;
 update rentozi_invitations set status='withdrawn' where kind='tenant' and target_id=p_tenant and status='pending';
 insert into rentozi_admin_events(actor,target,action,details) values(auth.uid(),p_user,'detach_tenant_login',jsonb_build_object('tenant_id',p_tenant,'reason',left(p_reason,500)));
 return jsonb_build_object('success',true);end $$;
revoke all on function public.rentozi_detach_tenant_login(uuid,uuid,text) from public,anon;grant execute on function public.rentozi_detach_tenant_login(uuid,uuid,text) to authenticated,service_role;
create or replace function public.rentozi_invitation_status(p_tenants uuid[]) returns table(tenant_id uuid,status text,sent_at timestamptz,delivery_error text) language sql stable security definer set search_path=public,pg_temp as $$
 select distinct on(i.target_id) i.target_id,case when i.status='pending' and i.expires_at<now() then 'expired' else i.status end,i.sent_at,i.delivery_error from rentozi_invitations i where i.kind='tenant' and i.target_id=any(p_tenants) and rentozi_tenant_access(i.target_id,true) order by i.target_id,i.created_at desc $$;
revoke all on function public.rentozi_invitation_status(uuid[]) from public,anon;grant execute on function public.rentozi_invitation_status(uuid[]) to authenticated,service_role;
commit;
