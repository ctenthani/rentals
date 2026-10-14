-- Counts follow actual management authority, not tenant membership labels.
begin;
alter table public.landlord_members add column if not exists access_disabled boolean not null default false;
create or replace function public.rentozi_manages(p_landlord uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select rentozi_user_enabled() and exists(select 1 from landlords l where l.id=p_landlord and
 (l.auth_user_id=auth.uid() or exists(select 1 from landlord_members m where m.landlord_id=l.id and m.auth_user_id=auth.uid() and m.role='manager' and not m.access_disabled)));
$$;
create or replace function public.my_landlord_id() returns uuid
language sql stable security definer set search_path=public,pg_temp as $$
 select l.id from landlords l where rentozi_user_enabled() and (l.auth_user_id=auth.uid() or exists(select 1 from landlord_members m where m.landlord_id=l.id and m.auth_user_id=auth.uid() and m.role='manager' and not m.access_disabled))
 order by (l.auth_user_id=auth.uid()) desc,l.id limit 1;
$$;
revoke all on function public.my_landlord_id(),public.rentozi_manages(uuid) from public,anon;
grant execute on function public.my_landlord_id(),public.rentozi_manages(uuid) to authenticated,service_role;

create or replace function public.rentozi_user_property_counts(p_users uuid[]) returns setof jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if auth.role() is distinct from 'service_role' then raise exception using errcode='42501',message='Server only'; end if;
 if p_users is null or cardinality(p_users)>100 then raise exception 'Select at most 100 accounts'; end if;
 return query
 select jsonb_build_object('user_id',u.id,
 'co_managed_businesses',count(distinct l.id) filter(where l.auth_user_id is distinct from u.id),
 'managed_properties',case when rentozi_user_enabled(u.id) then count(distinct h.id) filter(where h.is_active is distinct from false) else 0 end,
 'archived_properties',count(distinct h.id) filter(where h.is_active=false),
 'owned_properties',count(distinct h.id) filter(where h.is_active is distinct from false and l.auth_user_id=u.id),
 'shared_properties',count(distinct h.id) filter(where h.is_active is distinct from false and l.auth_user_id is distinct from u.id))
 from (select distinct unnest(p_users) id) u
 left join landlords l on l.auth_user_id=u.id or exists(select 1 from landlord_members m where m.landlord_id=l.id and m.auth_user_id=u.id and m.role='manager' and not m.access_disabled)
 left join houses h on h.landlord_id=l.id group by u.id;
end $$;
revoke all on function public.rentozi_user_property_counts(uuid[]) from public,anon,authenticated;
grant execute on function public.rentozi_user_property_counts(uuid[]) to service_role;

create or replace function public.rentozi_portfolio_users(p_landlord uuid) returns setof jsonb
language plpgsql stable security definer set search_path=public,pg_temp as $$
begin
 if not rentozi_owns_landlord(p_landlord) then raise exception using errcode='42501',message='Only this business owner can manage its roles'; end if;
 return query select jsonb_build_object('id',u.id,'email',u.email,
 'name',coalesce(nullif((select min(t.full_name) from tenants t where t.landlord_id=p_landlord and t.auth_user_id=u.id),''),nullif(u.raw_user_meta_data->>'full_name',''),u.email),
 'role',case when l.auth_user_id=u.id then 'owner' when m.role='manager' and not m.access_disabled then 'manager' when exists(select 1 from tenants t where t.landlord_id=p_landlord and t.auth_user_id=u.id) then 'tenant' else 'none' end,
 'has_tenant',exists(select 1 from tenants t where t.landlord_id=p_landlord and t.auth_user_id=u.id),
 'verified',u.email_confirmed_at is not null,'enabled',rentozi_user_enabled(u.id),'protected',l.auth_user_id=u.id,
 'pending_manager_invitation',exists(select 1 from rentozi_invitations i where i.kind='manager' and i.target_id=p_landlord and i.email=lower(u.email) and i.status='pending' and i.expires_at>now()))
 from auth.users u join landlords l on l.id=p_landlord
 left join landlord_members m on m.landlord_id=p_landlord and m.auth_user_id=u.id
 where l.auth_user_id=u.id or m.auth_user_id is not null or exists(select 1 from tenants t where t.landlord_id=p_landlord and t.auth_user_id=u.id)
 order by (l.auth_user_id=u.id) desc,u.email;
end $$;

create or replace function public.rentozi_set_portfolio_role(p_landlord uuid,p_user uuid,p_role text,p_expected_role text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare owner_id uuid; role_before text; tenant_link boolean; member landlord_members; recipient auth.users;
begin
 if not rentozi_owns_landlord(p_landlord) then raise exception using errcode='42501',message='Only this business owner can change its roles'; end if;
 perform pg_advisory_xact_lock(hashtextextended(p_landlord::text||':'||p_user::text,1410));
 select auth_user_id into owner_id from landlords where id=p_landlord for update;
 if owner_id is distinct from auth.uid() then raise exception using errcode='42501',message='Business ownership changed. Refresh before changing roles'; end if;
 if owner_id=p_user then raise exception 'The business owner role is protected'; end if;
 if p_role is null or p_role not in ('manager','tenant','none') then raise exception 'Choose tenant-only, co-manager or no portfolio access'; end if;
 select * into recipient from auth.users where id=p_user;
 if recipient.id is null then raise exception 'User not found'; end if;
 select * into member from landlord_members where landlord_id=p_landlord and auth_user_id=p_user for update;
 select exists(select 1 from tenants where landlord_id=p_landlord and auth_user_id=p_user) into tenant_link;
 if member.auth_user_id is null and not tenant_link then raise exception 'This user is not linked to your portfolio. Invite them first'; end if;
 role_before=case when member.role='manager' and not member.access_disabled then 'manager' when tenant_link then 'tenant' else 'none' end;
 if role_before is distinct from p_expected_role then raise exception 'Role changed. Refresh and review this user again'; end if;
 if p_role='tenant' and not tenant_link then raise exception 'This user has no tenant profile in your portfolio'; end if;
 if p_role='none' and tenant_link then raise exception 'Use tenant-only to retain this tenant rental history'; end if;
 if p_role='manager' then
  if not rentozi_user_enabled(p_user) or recipient.email_confirmed_at is null then raise exception 'Restore access and verify this user email before granting management'; end if;
  insert into landlord_members(landlord_id,auth_user_id,email,role,access_disabled) values(p_landlord,p_user,recipient.email,'manager',false)
  on conflict(landlord_id,auth_user_id) do update set role='manager',access_disabled=false,email=excluded.email;
 else
  update landlord_members set access_disabled=true where landlord_id=p_landlord and auth_user_id=p_user;
  update rentozi_invitations set status='withdrawn' where kind='manager' and target_id=p_landlord and email=lower(recipient.email) and status='pending';
 end if;
 insert into rentozi_admin_events(actor,target,action,details) values(auth.uid(),p_user,'change_portfolio_role',jsonb_build_object('landlord_id',p_landlord,'previous_role',role_before,'new_role',p_role));
 return jsonb_build_object('success',true,'role',p_role,'preserved_history',true);
end $$;
revoke all on function public.rentozi_portfolio_users(uuid),public.rentozi_set_portfolio_role(uuid,uuid,text,text) from public,anon;
grant execute on function public.rentozi_portfolio_users(uuid),public.rentozi_set_portfolio_role(uuid,uuid,text,text) to authenticated;
-- Role changes use the audited, scoped RPC or explicit invitation acceptance.
revoke insert,update,delete on public.landlord_members from authenticated;

-- A newly accepted, owner-authorised invitation can restore delegated access.
create or replace function public.rentozi_accept_invitation(p_invitation uuid) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$ declare i rentozi_invitations%rowtype;begin
 if not rentozi_user_enabled() or not exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null) then raise exception using errcode='42501',message='Verify your email first';end if;
 select * into i from rentozi_invitations where id=p_invitation for update;
 if not found or i.email<>(select lower(email) from auth.users where id=auth.uid()) then raise exception using errcode='42501',message='This invitation belongs to another email';end if;
 if i.status='accepted' and i.accepted_by=auth.uid() then return jsonb_build_object('success',true);end if;
 if i.status<>'pending' or i.expires_at<now() or not rentozi_user_enabled(i.created_by) then raise exception 'Invitation expired or withdrawn. Ask for a new one.';end if;
 if i.kind='tenant' then
 if not exists(select 1 from tenants t join landlords l on l.id=t.landlord_id where t.id=i.target_id and lower(trim(t.email))=i.email and (l.auth_user_id=i.created_by or exists(select 1 from landlord_members m where m.landlord_id=l.id and m.auth_user_id=i.created_by and m.role='manager' and not m.access_disabled))) then raise exception 'Tenant or invitation ownership changed';end if;
 update tenants set auth_user_id=auth.uid() where id=i.target_id and (auth_user_id is null or auth_user_id=auth.uid());if not found then raise exception 'Another login is already linked';end if;
 elsif i.kind='manager' then
 if not exists(select 1 from landlords where id=i.target_id and auth_user_id=i.created_by) then raise exception 'Business ownership changed';end if;
 insert into landlord_members(landlord_id,auth_user_id,email,role,access_disabled) values(i.target_id,auth.uid(),i.email,'manager',false) on conflict(landlord_id,auth_user_id) do update set role='manager',access_disabled=false,email=excluded.email;
 else
 if not exists(select 1 from rentozi_platform_owners where user_id=i.created_by) then raise exception 'Owner invitation withdrawn';end if;
 insert into landlords(auth_user_id,email,full_name,business_name) values(auth.uid(),i.email,i.full_name,coalesce(nullif(i.business_name,''),'My Rentals')) on conflict(auth_user_id) do nothing;
 end if;
 update rentozi_invitations set status='accepted',accepted_at=now(),accepted_by=auth.uid() where id=i.id;
 return jsonb_build_object('success',true,'destination',case when i.kind='tenant' then '/tenant' else '/dashboard' end);end $$;
commit;
