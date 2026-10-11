-- Coordinated app/database migration. Existing balances and payments are preserved.
begin;

create or replace function public.rentozi_manages(p_landlord uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select auth.uid() is not null and exists(select 1 from public.landlords l where l.id=p_landlord and
 (l.auth_user_id=auth.uid() or exists(select 1 from public.landlord_members m where m.landlord_id=l.id and m.auth_user_id=auth.uid() and m.role='manager')));
$$;
create or replace function public.rentozi_owns_landlord(p_landlord uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select auth.uid() is not null and exists(select 1 from public.landlords where id=p_landlord and auth_user_id=auth.uid());
$$;
create or replace function public.rentozi_tenant_access(p_tenant uuid,p_manage boolean default false) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select auth.uid() is not null and exists(select 1 from public.tenants t where t.id=p_tenant and
 (public.rentozi_manages(t.landlord_id) or (not p_manage and t.auth_user_id=auth.uid())));
$$;
create or replace function public.rentozi_landlord_access(p_landlord uuid) returns boolean
language sql stable security definer set search_path=public,pg_temp as $$
 select public.rentozi_manages(p_landlord) or exists(select 1 from public.tenants where landlord_id=p_landlord and auth_user_id=auth.uid());
$$;

-- Replace permissive policies rather than adding restrictive-looking OR alternatives.
do $$ declare p record; begin
 for p in select * from pg_policies where schemaname='public' and tablename in
 ('houses','tenants','leases','payments','payment_submissions','tenant_balances','landlords','landlord_members','tenant_issues') loop
 execute format('drop policy %I on public.%I',p.policyname,p.tablename);
 end loop;
end $$;
alter table public.houses enable row level security;
alter table public.tenants enable row level security;
alter table public.leases enable row level security;
alter table public.payments enable row level security;
alter table public.payment_submissions enable row level security;
alter table public.tenant_balances enable row level security;
alter table public.landlords enable row level security;
alter table public.landlord_members enable row level security;
alter table public.tenant_issues enable row level security;
create policy rentozi_houses_read on public.houses for select to authenticated using
 (public.rentozi_manages(landlord_id) or exists(select 1 from public.tenants t where t.house_id=houses.id and t.auth_user_id=auth.uid()));
create policy rentozi_houses_manage on public.houses for all to authenticated using(public.rentozi_manages(landlord_id)) with check(public.rentozi_manages(landlord_id));
create policy rentozi_tenants_read on public.tenants for select to authenticated using(auth_user_id=auth.uid() or public.rentozi_manages(landlord_id));
create policy rentozi_tenants_manage on public.tenants for all to authenticated using(public.rentozi_manages(landlord_id)) with check
 (public.rentozi_manages(landlord_id) and exists(select 1 from public.houses h where h.id=tenants.house_id and h.landlord_id=tenants.landlord_id));
create policy rentozi_leases_read on public.leases for select to authenticated using(public.rentozi_tenant_access(tenant_id));
create policy rentozi_leases_manage on public.leases for all to authenticated using(public.rentozi_tenant_access(tenant_id,true)) with check(public.rentozi_tenant_access(tenant_id,true));
create policy rentozi_payments_read on public.payments for select to authenticated using(public.rentozi_tenant_access(tenant_id));
create policy rentozi_submissions_read on public.payment_submissions for select to authenticated using(public.rentozi_tenant_access(tenant_id));
create policy rentozi_submissions_insert on public.payment_submissions for insert to authenticated with check
 (status='pending' and processed_at is null and processed_by is null and amount>0 and amount::text not in ('NaN','Infinity','-Infinity') and
 exists(select 1 from public.tenants t where t.id=tenant_id and t.auth_user_id=auth.uid() and t.is_active));
create policy rentozi_balances_read on public.tenant_balances for select to authenticated using(public.rentozi_tenant_access(tenant_id));
create policy rentozi_balances_manage on public.tenant_balances for all to authenticated using(public.rentozi_tenant_access(tenant_id,true)) with check(public.rentozi_tenant_access(tenant_id,true));
create policy rentozi_landlords_read on public.landlords for select to authenticated using(public.rentozi_landlord_access(id));
create policy rentozi_landlords_update on public.landlords for update to authenticated using(public.rentozi_manages(id)) with check(public.rentozi_manages(id));
create policy rentozi_members_read on public.landlord_members for select to authenticated using(auth_user_id=auth.uid() or public.rentozi_manages(landlord_id));
create policy rentozi_members_manage on public.landlord_members for all to authenticated using(public.rentozi_owns_landlord(landlord_id)) with check(public.rentozi_owns_landlord(landlord_id) and role='manager');
create policy rentozi_issues_read on public.tenant_issues for select to authenticated using(public.rentozi_tenant_access(tenant_id));
create policy rentozi_issues_insert on public.tenant_issues for insert to authenticated with check
 (status='open' and exists(select 1 from public.tenants t where t.id=tenant_id and t.auth_user_id=auth.uid()));
create policy rentozi_issues_update on public.tenant_issues for update to authenticated using(public.rentozi_tenant_access(tenant_id,true)) with check(public.rentozi_tenant_access(tenant_id,true));
revoke all on public.payments,public.payment_submissions from anon;
revoke insert,update,delete on public.payments,public.payment_submissions from authenticated;
grant select on public.payments to authenticated;
grant select,insert on public.payment_submissions to authenticated;
revoke insert,delete,update on public.landlords from authenticated;
grant update(full_name,phone,business_name,email,airtel_number,mpamba_number,bank_name,bank_account,payment_notes,accent_color) on public.landlords to authenticated;
alter view public.tenant_overview set(security_invoker=true);
revoke all on public.tenant_overview from public,anon;
grant select on public.tenant_overview to authenticated;
revoke create on schema public from public,anon,authenticated;

alter table public.tenant_balances add column if not exists partial_credit numeric not null default 0;
alter table public.tenant_balances add column if not exists balance_as_of date;
alter table public.payments add column if not exists request_id uuid;
alter table public.payments add column if not exists voided_at timestamptz;
alter table public.payments add column if not exists voided_by uuid;
alter table public.payments add column if not exists void_reason text;
do $$ begin
 if not exists(select 1 from pg_constraint where conname='rentozi_positive_rent' and conrelid='public.houses'::regclass) then
  alter table public.houses add constraint rentozi_positive_rent check(monthly_rent>0 and monthly_rent<100000000000 and monthly_rent::text not in ('NaN','Infinity','-Infinity')) not valid;
 end if;
 if not exists(select 1 from pg_constraint where conname='rentozi_valid_submission' and conrelid='public.payment_submissions'::regclass) then
  alter table public.payment_submissions add constraint rentozi_valid_submission check(amount>0 and amount<100000000000 and amount=round(amount,2) and amount::text not in ('NaN','Infinity','-Infinity')) not valid;
 end if;
end $$;
create unique index if not exists rentozi_payment_request on public.payments(request_id) where request_id is not null;
create table if not exists public.rentozi_payment_events(
 sequence bigint generated always as identity primary key,
 payment_id uuid not null unique references public.payments(id),
 tenant_id uuid not null references public.tenants(id),
 before_balance jsonb not null, after_balance jsonb not null,
 actor_id uuid not null, created_at timestamptz not null default clock_timestamp(),
 reversed_at timestamptz, reversed_by uuid, reversal_reason text
);
alter table public.rentozi_payment_events enable row level security;
revoke all on public.rentozi_payment_events from public,anon,authenticated;
grant select on public.rentozi_payment_events to authenticated;
drop policy if exists rentozi_events_read on public.rentozi_payment_events;
create policy rentozi_events_read on public.rentozi_payment_events for select to authenticated using(public.rentozi_tenant_access(tenant_id,true));

create or replace function public.rentozi_due_cycles(p_due date,p_day date) returns integer
language plpgsql immutable set search_path=public,pg_temp as $$
declare n integer; begin
 if p_due is null or p_due>p_day then return 0; end if;
 n:=(extract(year from p_day)::integer-extract(year from p_due)::integer)*12+extract(month from p_day)::integer-extract(month from p_due)::integer;
 return greatest(0,n+case when (p_due+make_interval(months=>n))::date<=p_day then 1 else 0 end);
end $$;
create or replace function public.rentozi_effective_balance(p_balance numeric,p_due date,p_rent numeric,p_credit numeric,p_as_of date,p_day date) returns numeric
language sql immutable set search_path=public,pg_temp as $$
 select greatest(0,case when p_as_of is null then greatest(coalesce(p_balance,0),public.rentozi_due_cycles(p_due,p_day)*p_rent-coalesce(p_credit,0))
 else coalesce(p_balance,0)+greatest(0,public.rentozi_due_cycles(p_due,p_day)-public.rentozi_due_cycles(p_due,p_as_of))*p_rent end);
$$;
create or replace function public.rentozi_allocate(p_due date,p_credit numeric,p_debt numeric,p_amount numeric,p_rent numeric,p_day date) returns jsonb
language plpgsql immutable set search_path=public,pg_temp as $$
declare c numeric; d numeric; n integer; nd date; begin
 if p_rent is null or p_rent<=0 or p_rent::text in ('NaN','Infinity','-Infinity') or p_amount is null or p_amount<=0 or p_amount::text in ('NaN','Infinity','-Infinity') then raise exception 'Rent and payment must be positive finite amounts'; end if;
 d:=greatest(0,p_debt-p_amount); c:=coalesce(p_credit,0)+greatest(0,p_amount-p_debt);
 n:=floor(c/p_rent)::integer; c:=c-n*p_rent;
 nd:=(p_due+make_interval(months=>n))::date;
 return jsonb_build_object('months',n,'credit',c,'due',nd,'balance',greatest(0,public.rentozi_due_cycles(nd,p_day)*p_rent-c)+d);
end $$;

-- Called only by authorised public RPCs below, never directly by clients.
create or replace function public.rentozi_apply_payment(p_tenant uuid,p_amount numeric,p_method text,p_date date,p_reference text,p_request uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare b public.tenant_balances%rowtype; existing public.payments%rowtype; rent numeric; due date; effective numeric; debt numeric; a jsonb; before_state jsonb; after_state jsonb; payment uuid; st text; begin
 if not public.rentozi_tenant_access(p_tenant,true) then raise exception using errcode='42501',message='Only the responsible landlord or co-manager can record this payment'; end if;
 if p_request is null or p_amount is null or p_amount<=0 or p_amount>100000000000 or p_amount::text in ('NaN','Infinity','-Infinity') or p_amount<>round(p_amount,2) then raise exception 'Enter a positive amount with at most two decimal places'; end if;
 if p_date is null or p_date>current_date or p_date<date '1900-01-01' then raise exception 'Payment date must be a valid date on or before today'; end if;
 select h.monthly_rent into rent from public.tenants t join public.houses h on h.id=t.house_id where t.id=p_tenant for share of h;
 if rent is null or rent<=0 then raise exception 'Set a valid monthly rent before recording a payment'; end if;
 insert into public.tenant_balances(tenant_id) values(p_tenant) on conflict do nothing;
 select * into b from public.tenant_balances where tenant_id=p_tenant for update;
 select * into existing from public.payments where request_id=p_request;
 if found then
  if existing.tenant_id<>p_tenant or existing.amount<>p_amount or existing.paid_date<>p_date or existing.method is distinct from p_method or existing.reference is distinct from p_reference then raise exception 'This request reference was already used for different payment details'; end if;
  if existing.voided_at is not null then raise exception 'This payment was reversed. Use a new request for a replacement'; end if;
  return jsonb_build_object('payment_id',existing.id,'already_processed',true,'months',existing.months_covered,'next_due_date',b.next_due_date,'balance',public.rentozi_effective_balance(b.current_balance,b.next_due_date,rent,b.partial_credit,b.balance_as_of,current_date),'credit',b.partial_credit);
 end if;
 before_state:=to_jsonb(b); due:=coalesce(b.next_due_date,date_trunc('month',current_date)::date);
 effective:=public.rentozi_effective_balance(b.current_balance,due,rent,b.partial_credit,b.balance_as_of,current_date);
 debt:=greatest(0,effective-greatest(0,public.rentozi_due_cycles(due,current_date)*rent-b.partial_credit));
 a:=public.rentozi_allocate(due,b.partial_credit,debt,p_amount,rent,current_date);
 st:=case when (a->>'balance')::numeric>0 then case when (a->>'due')::date=current_date then 'due' else 'overdue' end when (a->>'due')::date>current_date then 'paid' else 'upcoming' end;
 insert into public.payments(tenant_id,amount,method,paid_date,reference,months_covered,recorded_by,request_id)
 values(p_tenant,p_amount,p_method,p_date,p_reference,(a->>'months')::integer,auth.uid(),p_request) returning id into payment;
 update public.tenant_balances set next_due_date=(a->>'due')::date,partial_credit=(a->>'credit')::numeric,current_balance=(a->>'balance')::numeric,balance_as_of=current_date,
 months_in_advance=b.months_in_advance+(a->>'months')::integer,status=st,last_payment_date=p_date where tenant_id=p_tenant;
 select to_jsonb(x) into after_state from public.tenant_balances x where tenant_id=p_tenant;
 insert into public.rentozi_payment_events(payment_id,tenant_id,before_balance,after_balance,actor_id) values(payment,p_tenant,before_state,after_state,auth.uid());
 return jsonb_build_object('payment_id',payment,'months',(a->>'months')::integer,'next_due_date',a->>'due','balance',(a->>'balance')::numeric,'credit',(a->>'credit')::numeric,'already_processed',false);
end $$;
create or replace function public.rentozi_record_payment(p_tenant uuid,p_amount numeric,p_method text,p_date date,p_reference text,p_request uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$ begin
 return public.rentozi_apply_payment(p_tenant,p_amount,p_method,p_date,p_reference,p_request);
end $$;
create or replace function public.rentozi_review_submission(p_id uuid,p_approve boolean) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare s public.payment_submissions%rowtype; result jsonb; begin
 select * into s from public.payment_submissions where id=p_id for update;
 if not found or not public.rentozi_tenant_access(s.tenant_id,true) then raise exception using errcode='42501',message='This submission is not available to your landlord account'; end if;
 if s.status<>'pending' then
  if (p_approve and s.status='confirmed') or (not p_approve and s.status='rejected') then return jsonb_build_object('already_processed',true); end if;
  raise exception 'This submission has already been processed';
 end if;
 if p_approve then result:=public.rentozi_apply_payment(s.tenant_id,s.amount,s.method,s.paid_date,s.reference_used,s.id); else result:='{}'::jsonb; end if;
 update public.payment_submissions set status=case when p_approve then 'confirmed' else 'rejected' end,processed_at=clock_timestamp(),processed_by=auth.uid() where id=p_id;
 return result||jsonb_build_object('already_processed',false);
end $$;

create or replace function public.rentozi_reverse_payments(p_ids uuid[],p_reason text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare p record; e public.rentozi_payment_events%rowtype; b public.tenant_balances%rowtype; snap public.tenant_balances%rowtype; latest bigint; rent numeric; count_reversed integer:=0; begin
 if auth.uid() is null or coalesce(cardinality(p_ids),0)=0 or cardinality(p_ids)>1000 or length(btrim(coalesce(p_reason,'')))<5 then raise exception 'Select payments and give a reason of at least five characters'; end if;
 if (select count(*) from public.payments where id=any(p_ids))<>(select count(distinct x) from unnest(p_ids) x) then raise exception 'A selected payment was not found'; end if;
 for p in select x.*,v.sequence from public.payments x left join public.rentozi_payment_events v on v.payment_id=x.id where x.id=any(p_ids) order by x.tenant_id,v.sequence desc loop
  if not public.rentozi_tenant_access(p.tenant_id,true) then raise exception using errcode='42501',message='You can reverse only your own business payments'; end if;
  if p.voided_at is not null then continue; end if;
  if p.sequence is null then raise exception 'This historical payment predates the audited ledger. Reconcile it with the landlord before changing its balance'; end if;
  select * into b from public.tenant_balances where tenant_id=p.tenant_id for update;
  select max(sequence) into latest from public.rentozi_payment_events where tenant_id=p.tenant_id and reversed_at is null;
  if latest<>p.sequence then raise exception 'Reverse newer payments for this tenant first, or include them in this selection'; end if;
  select * into e from public.rentozi_payment_events where payment_id=p.id for update;
  select * into snap from jsonb_populate_record(null::public.tenant_balances,e.after_balance);
  select h.monthly_rent into rent from public.tenants t join public.houses h on h.id=t.house_id where t.id=p.tenant_id;
  if b.next_due_date is distinct from snap.next_due_date or b.partial_credit is distinct from snap.partial_credit or
   public.rentozi_effective_balance(b.current_balance,b.next_due_date,rent,b.partial_credit,b.balance_as_of,current_date) is distinct from public.rentozi_effective_balance(snap.current_balance,snap.next_due_date,rent,snap.partial_credit,snap.balance_as_of,current_date) then raise exception 'This account was adjusted after the payment. Reconcile the adjustment before reversing it'; end if;
  select * into snap from jsonb_populate_record(null::public.tenant_balances,e.before_balance);
  update public.tenant_balances set current_balance=snap.current_balance,next_due_date=snap.next_due_date,months_in_advance=snap.months_in_advance,status=snap.status,last_payment_date=snap.last_payment_date,partial_credit=snap.partial_credit,balance_as_of=snap.balance_as_of where tenant_id=p.tenant_id;
  update public.payments set voided_at=clock_timestamp(),voided_by=auth.uid(),void_reason=btrim(p_reason) where id=p.id;
  update public.rentozi_payment_events set reversed_at=clock_timestamp(),reversed_by=auth.uid(),reversal_reason=btrim(p_reason) where payment_id=p.id;
  count_reversed:=count_reversed+1;
 end loop;
 return jsonb_build_object('reversed',count_reversed);
end $$;

-- Archive properties: deleting ledger history is no longer a side effect of removal.
create or replace function public.landlord_delete_property(p_tenant_id uuid) returns json
language plpgsql security definer set search_path=public,pg_temp as $$
declare hid uuid; begin
 if not public.rentozi_tenant_access(p_tenant_id,true) then raise exception using errcode='42501',message='Not your landlord account'; end if;
 update public.tenants set is_active=false where id=p_tenant_id returning house_id into hid;
 update public.houses set is_active=false where id=hid;
 return json_build_object('success',true,'archived',true);
end $$;
create or replace function public.rentozi_restore_property(p_tenant_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare hid uuid; begin
 if not public.rentozi_tenant_access(p_tenant_id,true) then raise exception using errcode='42501',message='Not your landlord account'; end if;
 update public.tenants set is_active=true where id=p_tenant_id returning house_id into hid;
 update public.houses set is_active=true where id=hid;
 return jsonb_build_object('success',true);
end $$;

create or replace function public.rentozi_save_identity(p_tenant uuid,p_number text,p_document text,p_type text) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$ begin
 if auth.uid() is null or not exists(select 1 from public.tenants where id=p_tenant and auth_user_id=auth.uid()) then raise exception using errcode='42501',message='Only the tenant can save their identity document'; end if;
 if length(btrim(coalesce(p_number,'')))<3 or length(p_number)>100 or p_type not in ('national_id','passport') or p_document not like p_tenant::text||'/%' then raise exception 'Enter a valid ID and upload a document to your tenant folder'; end if;
 update public.tenants set national_id=btrim(p_number),id_document_url=p_document,id_document_type=p_type where id=p_tenant;
 return jsonb_build_object('success',true);
end $$;
create or replace function public.rentozi_sign_lease(p_tenant uuid,p_signature text,p_name text,p_number text default null,p_doc_path text default null) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare l public.leases%rowtype; begin
 if auth.uid() is null or not exists(select 1 from public.tenants where id=p_tenant and auth_user_id=auth.uid()) then raise exception using errcode='42501',message='Only the tenant can sign their own lease'; end if;
 if p_signature is null or p_signature not like 'data:image/%;base64,%' or length(p_signature)>500000 or length(btrim(coalesce(p_name,'')))=0 then raise exception 'Provide your name and signature'; end if;
 select * into l from public.leases where tenant_id=p_tenant and status='active' order by created_at desc limit 1 for update;
 if not found or coalesce(l.end_date,l.lease_end,current_date)<current_date then raise exception 'No current active lease is available'; end if;
 if l.tenant_signature is not null and l.tenant_signature<>p_signature then raise exception 'This lease is already signed. Ask the landlord to prepare a new agreement for changes'; end if;
 if p_doc_path is not null and p_doc_path not like p_tenant::text||'/%' and p_doc_path not like 'ids/'||p_tenant::text||'/%' then raise exception 'Invalid tenant document folder'; end if;
 update public.leases set tenant_signature=p_signature,tenant_signer_name=btrim(p_name),tenant_signed_at=coalesce(tenant_signed_at,clock_timestamp()),id_number=coalesce(p_number,id_number),id_doc_path=coalesce(p_doc_path,id_doc_path) where id=l.id;
 return jsonb_build_object('success',true,'lease_id',l.id);
end $$;
create or replace function public.landlord_public(p_id uuid) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$ begin
 if not public.rentozi_landlord_access(p_id) then raise exception using errcode='42501',message='Landlord details are private'; end if;
 return(select jsonb_build_object('id',id,'full_name',full_name,'business_name',business_name,'email',email) from public.landlords where id=p_id);
end $$;

create table if not exists public.rentozi_account_adjustments(
 id uuid primary key default gen_random_uuid(), tenant_id uuid not null references public.tenants(id),
 before_balance jsonb not null,after_balance jsonb not null,actor_id uuid not null,created_at timestamptz not null default clock_timestamp()
);
alter table public.rentozi_account_adjustments enable row level security;
revoke all on public.rentozi_account_adjustments from public,anon,authenticated;
grant select on public.rentozi_account_adjustments to authenticated;
drop policy if exists rentozi_adjustments_read on public.rentozi_account_adjustments;
create policy rentozi_adjustments_read on public.rentozi_account_adjustments for select to authenticated using(public.rentozi_tenant_access(tenant_id,true));
create or replace function public.rentozi_update_property(p_tenant uuid,p_details jsonb) returns jsonb
language plpgsql security definer set search_path=public,pg_temp as $$
declare t public.tenants%rowtype; b public.tenant_balances%rowtype; r numeric; oldrent numeric; amount numeric; due date; advanced integer; after_state jsonb; begin
 if not public.rentozi_tenant_access(p_tenant,true) then raise exception using errcode='42501',message='Not your landlord account'; end if;
 select * into t from public.tenants where id=p_tenant for update;
 select monthly_rent into oldrent from public.houses where id=t.house_id for update;
 select * into b from public.tenant_balances where tenant_id=p_tenant for update;
 r:=(p_details->>'monthly_rent')::numeric; amount:=(p_details->>'current_balance')::numeric;
 due:=(p_details->>'next_due_date')::date; advanced:=(p_details->>'months_in_advance')::integer;
 if r is null or r<=0 or r>100000000000 or amount is null or amount<0 or amount>100000000000 or advanced is null or advanced<0 or advanced>1200 or length(btrim(coalesce(p_details->>'full_name','')))=0 or length(btrim(coalesce(p_details->>'house_name','')))=0 then raise exception 'Enter valid names, rent, balance and cycle length'; end if;
 update public.tenants set full_name=btrim(p_details->>'full_name'),phone=p_details->>'phone',email=nullif(btrim(p_details->>'email'),'') where id=p_tenant;
 update public.houses set name=btrim(p_details->>'house_name'),code=btrim(p_details->>'house_code'),monthly_rent=r,bank_account=coalesce(p_details->>'bank_account','') where id=t.house_id;
 if amount is distinct from public.rentozi_effective_balance(b.current_balance,b.next_due_date,oldrent,b.partial_credit,b.balance_as_of,current_date) or due is distinct from b.next_due_date or advanced is distinct from b.months_in_advance or r is distinct from oldrent then
  insert into public.tenant_balances(tenant_id,current_balance,next_due_date,months_in_advance,partial_credit,balance_as_of,status)
  values(p_tenant,amount,due,advanced,coalesce(b.partial_credit,0),current_date,case when amount>0 then 'overdue' when due>current_date then 'paid' else 'upcoming' end)
  on conflict(tenant_id) do update set current_balance=excluded.current_balance,next_due_date=excluded.next_due_date,months_in_advance=excluded.months_in_advance,balance_as_of=excluded.balance_as_of,status=excluded.status;
  select to_jsonb(x) into after_state from public.tenant_balances x where tenant_id=p_tenant;
  insert into public.rentozi_account_adjustments(tenant_id,before_balance,after_balance,actor_id) values(p_tenant,coalesce(to_jsonb(b),'{}'),after_state,auth.uid());
 end if;
 return jsonb_build_object('success',true);
end $$;

-- The scheduler uses the same balance calculation; it never discards partial credit.
create or replace function public.run_monthly_dues() returns json
language plpgsql security definer set search_path=public,pg_temp as $$
declare changed integer; begin
 update public.tenant_balances b set current_balance=public.rentozi_effective_balance(b.current_balance,b.next_due_date,h.monthly_rent,b.partial_credit,b.balance_as_of,current_date),
 balance_as_of=current_date,status=case when public.rentozi_effective_balance(b.current_balance,b.next_due_date,h.monthly_rent,b.partial_credit,b.balance_as_of,current_date)>0 then case when b.next_due_date=current_date then 'due' else 'overdue' end when b.next_due_date>current_date then 'paid' else 'upcoming' end
 from public.tenants t join public.houses h on h.id=t.house_id where t.id=b.tenant_id and t.is_active;
 get diagnostics changed=row_count; return json_build_object('success',true,'updated',changed);
end $$;

-- Private evidence retains existing tenant-folder paths, including older public URLs.
create or replace function public.rentozi_storage_access(p_bucket text,p_name text) returns boolean
language plpgsql stable security definer set search_path=public,pg_temp as $$
declare folder text; begin
 if p_bucket not in ('tenant-ids','payment-proofs') then return false; end if;
 folder:=split_part(p_name,'/',1);
 if folder !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then return false; end if;
 return public.rentozi_tenant_access(folder::uuid);
end $$;
drop policy if exists "Public read proofs" on storage.objects;
drop policy if exists "Auth upload proofs" on storage.objects;
drop policy if exists "Auth upload tenant ids" on storage.objects;
drop policy if exists "Public read tenant ids" on storage.objects;
drop policy if exists rentozi_private_documents_read on storage.objects;
drop policy if exists rentozi_private_documents_insert on storage.objects;
create policy rentozi_private_documents_read on storage.objects for select to authenticated using(public.rentozi_storage_access(bucket_id,name));
create policy rentozi_private_documents_insert on storage.objects for insert to authenticated with check(public.rentozi_storage_access(bucket_id,name));
update storage.buckets set public=false,file_size_limit=5242880,allowed_mime_types=array['image/jpeg','image/png','image/webp','application/pdf'] where id in ('tenant-ids','payment-proofs');

-- Prevent direct edits bypassing the audited account RPC. Signatures belong to the tenant.
revoke insert,update,delete on public.tenant_balances from authenticated;
revoke update,delete on public.tenants from authenticated;
revoke delete on public.houses from authenticated;
revoke insert,update,delete on public.leases from authenticated;
grant insert(tenant_id,house_id,landlord_id,start_date,end_date,monthly_rent,deposit_amount,payment_day,notice_period_days,terms,status,document_url,landlord_signature,landlord_signed_at,landlord_signer_name,move_in,lease_start,lease_end,deposit,notice_days),
 update(house_id,landlord_id,start_date,end_date,monthly_rent,deposit_amount,payment_day,notice_period_days,terms,status,document_url,landlord_signature,landlord_signed_at,landlord_signer_name,move_in,lease_start,lease_end,deposit,notice_days) on public.leases to authenticated;
create or replace function public.rentozi_preserve_signed_lease() returns trigger
language plpgsql set search_path=public,pg_temp as $$ begin
 if old.tenant_signature is not null and (new.tenant_signature is distinct from old.tenant_signature or new.terms is distinct from old.terms or new.monthly_rent is distinct from old.monthly_rent or new.start_date is distinct from old.start_date or new.end_date is distinct from old.end_date or new.lease_start is distinct from old.lease_start or new.lease_end is distinct from old.lease_end or new.deposit is distinct from old.deposit or new.deposit_amount is distinct from old.deposit_amount or new.payment_day is distinct from old.payment_day or new.notice_days is distinct from old.notice_days or new.notice_period_days is distinct from old.notice_period_days or new.tenant_id is distinct from old.tenant_id) then raise exception 'Signed agreements are preserved. Prepare a new agreement for changed terms'; end if;
 return new;
end $$;
drop trigger if exists rentozi_signed_lease_guard on public.leases;
create trigger rentozi_signed_lease_guard before update on public.leases for each row execute function public.rentozi_preserve_signed_lease();

-- All existing public functions lose anonymous execution. Retire unsafe legacy RPCs.
create table if not exists public.rentozi_email_limits(actor_id uuid not null,hour timestamptz not null,count integer not null,primary key(actor_id,hour));
alter table public.rentozi_email_limits enable row level security;
revoke all on public.rentozi_email_limits from public,anon,authenticated;
create or replace function public.rentozi_email_recipient(p_email text) returns boolean
language plpgsql security definer set search_path=public,pg_temp as $$
declare n integer; cap integer; begin
 if auth.uid() is null or not exists(select 1 from public.tenants t join public.landlords l on l.id=t.landlord_id where
  (public.rentozi_manages(l.id) and (lower(btrim(t.email))=lower(btrim(p_email)) or lower(btrim(l.email))=lower(btrim(p_email))))
  or (t.auth_user_id=auth.uid() and lower(btrim(l.email))=lower(btrim(p_email)))) then return false; end if;
 cap:=case when exists(select 1 from public.landlords l where public.rentozi_manages(l.id)) then 100 else 10 end;
 insert into public.rentozi_email_limits(actor_id,hour,count) values(auth.uid(),date_trunc('hour',now()),1)
 on conflict(actor_id,hour) do update set count=rentozi_email_limits.count+1 returning count into n;
 return n<=cap;
end $$;
do $$ declare f record; begin
 for f in select p.oid,p.proname,p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' loop
  execute format('revoke execute on function %s from public,anon',f.oid::regprocedure);
  if f.prosecdef then execute format('alter function %s set search_path=public,pg_temp',f.oid::regprocedure); end if;
  if f.proname in ('record_landlord_payment','confirm_payment_submission','reject_payment_submission','landlord_update_tenant','landlord_upsert_lease','tenant_sign_lease','run_monthly_dues','tenants_due_in_days','rentozi_apply_payment','rentozi_allocate','rentozi_due_cycles','rentozi_effective_balance') then
   execute format('revoke execute on function %s from authenticated',f.oid::regprocedure);
  else execute format('grant execute on function %s to authenticated',f.oid::regprocedure); end if;
  execute format('grant execute on function %s to service_role',f.oid::regprocedure);
 end loop;
end $$;
commit;
