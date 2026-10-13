begin;
-- Append to the migration with its final COMMIT removed. No fixtures survive.
create function pg_temp.assert_true(value boolean,message text) returns void language plpgsql as $$ begin if value is distinct from true then raise exception 'CHECK FAILED: %',message; end if; end $$;
select pg_temp.assert_true(public.rentozi_due_cycles(date '2026-01-31',date '2026-02-28')=2,'Month-end due cycles');
select pg_temp.assert_true((public.rentozi_allocate(date '2026-10-01',0,0,400,1000,date '2026-10-11')->>'balance')::numeric=600,'Partial payment leaves balance');
select pg_temp.assert_true((public.rentozi_allocate(date '2026-10-01',400,0,600,1000,date '2026-10-11')->>'months')::integer=1,'Partial credits combine');
select pg_temp.assert_true(not has_function_privilege('anon','public.rentozi_record_payment(uuid,numeric,text,date,text,uuid)','EXECUTE'),'Anonymous RPC blocked');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.record_landlord_payment(uuid,numeric,integer)','EXECUTE'),'Legacy unsafe RPC blocked');
select pg_temp.assert_true(not has_table_privilege('authenticated','public.payments','INSERT'),'Direct confirmed payment blocked');
select pg_temp.assert_true(not has_table_privilege('authenticated','public.tenant_balances','UPDATE'),'Direct balance overwrite blocked');
insert into auth.users(id,email) values
 ('eeeeeeee-0000-4000-8000-000000000001','rentozi-test-owner-a@example.invalid'),
 ('eeeeeeee-0000-4000-8000-000000000002','rentozi-test-owner-b@example.invalid'),
 ('eeeeeeee-0000-4000-8000-000000000003','rentozi-test-tenant-a@example.invalid'),
 ('eeeeeeee-0000-4000-8000-000000000004','rentozi-test-tenant-b@example.invalid'),
 ('eeeeeeee-0000-4000-8000-000000000005','rentozi-test-manager@example.invalid');
insert into public.landlords(id,auth_user_id,full_name,business_name) values
 ('eeeeeeee-0000-4000-8000-000000000011','eeeeeeee-0000-4000-8000-000000000001','ROLLBACK TEST A','ROLLBACK TEST A'),
 ('eeeeeeee-0000-4000-8000-000000000012','eeeeeeee-0000-4000-8000-000000000002','ROLLBACK TEST B','ROLLBACK TEST B');
insert into public.landlord_members(landlord_id,auth_user_id,email,role) values('eeeeeeee-0000-4000-8000-000000000011','eeeeeeee-0000-4000-8000-000000000005','rentozi-test-manager@example.invalid','manager');
insert into public.houses(id,landlord_id,name,code,monthly_rent,bank_account) values
 ('eeeeeeee-0000-4000-8000-000000000021','eeeeeeee-0000-4000-8000-000000000011','ROLLBACK TEST A','ROLLBACK-A',1000,''),
 ('eeeeeeee-0000-4000-8000-000000000022','eeeeeeee-0000-4000-8000-000000000012','ROLLBACK TEST B','ROLLBACK-B',1000,'');
insert into public.tenants(id,landlord_id,house_id,auth_user_id,full_name) values
 ('eeeeeeee-0000-4000-8000-000000000031','eeeeeeee-0000-4000-8000-000000000011','eeeeeeee-0000-4000-8000-000000000021','eeeeeeee-0000-4000-8000-000000000003','ROLLBACK TEST A'),
 ('eeeeeeee-0000-4000-8000-000000000032','eeeeeeee-0000-4000-8000-000000000012','eeeeeeee-0000-4000-8000-000000000022','eeeeeeee-0000-4000-8000-000000000004','ROLLBACK TEST B');
insert into public.tenant_balances(tenant_id,next_due_date,current_balance,balance_as_of) values
 ('eeeeeeee-0000-4000-8000-000000000031',date_trunc('month',current_date)::date,1000,current_date),
 ('eeeeeeee-0000-4000-8000-000000000032',date_trunc('month',current_date)::date,1000,current_date);

update auth.users set email_confirmed_at=now() where id in ('eeeeeeee-0000-4000-8000-000000000001','eeeeeeee-0000-4000-8000-000000000003','eeeeeeee-0000-4000-8000-000000000004');
insert into auth.users(id,email,email_confirmed_at) values('eeeeeeee-0000-4000-8000-000000000006','rentozi-unused@example.invalid',now());
insert into rentozi_platform_owners(user_id) values('eeeeeeee-0000-4000-8000-000000000001');
update tenants set email='rentozi-test-tenant-a@example.invalid',auth_user_id=null where id='eeeeeeee-0000-4000-8000-000000000031';
update tenants set auth_user_id='eeeeeeee-0000-4000-8000-000000000001' where id='eeeeeeee-0000-4000-8000-000000000032';
select pg_temp.assert_true(not has_table_privilege('authenticated','public.rentozi_platform_owners','SELECT'),'Owner registry is private');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.rentozi_auth_user_id(text)','EXECUTE'),'Account email lookup is server only');
select pg_temp.assert_true(not has_function_privilege('authenticated','public.invite_landlord_member(text)','EXECUTE'),'Legacy consent bypass is retired');
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','eeeeeeee-0000-4000-8000-000000000002',true);
set local role authenticated;
select pg_temp.assert_true(not rentozi_is_platform_owner(),'Business owner is not platform owner');
do $$ begin begin perform rentozi_set_user_access('eeeeeeee-0000-4000-8000-000000000003',false,'Test');raise exception 'CHECK FAILED: ordinary landlord removed a user';exception when insufficient_privilege then null;end;end $$;
reset role;
select set_config('request.jwt.claim.sub','eeeeeeee-0000-4000-8000-000000000001',true);
set local role authenticated;
select pg_temp.assert_true(rentozi_is_platform_owner(),'Stored owner ID grants owner role');
select pg_temp.assert_true(not rentozi_unused_user('eeeeeeee-0000-4000-8000-000000000002'),'Linked business cannot be deleted');
select pg_temp.assert_true(rentozi_unused_user('eeeeeeee-0000-4000-8000-000000000006'),'Unused login can be deleted');
do $$ begin begin perform rentozi_set_user_access('eeeeeeee-0000-4000-8000-000000000001',false,'Test');raise exception 'CHECK FAILED: own owner login removed';exception when raise_exception then if SQLERRM like 'CHECK FAILED:%' then raise;end if;end;end $$;
select rentozi_set_user_access('eeeeeeee-0000-4000-8000-000000000002',false,'Rollback access test');
select set_config('request.jwt.claim.sub','eeeeeeee-0000-4000-8000-000000000002',true);
select pg_temp.assert_true(not rentozi_user_enabled(),'Removed user immediately blocked');
select pg_temp.assert_true(not rentozi_manages('eeeeeeee-0000-4000-8000-000000000012'),'Existing session loses business access');
select pg_temp.assert_true((select count(*) from landlords)=0,'Restrictive RLS blocks removed user');
do $$ begin begin perform create_landlord_profile('Unauthorized','Unauthorized');raise exception 'CHECK FAILED: disabled user wrote using legacy definer';exception when insufficient_privilege then null;end;end $$;
reset role;
select set_config('request.jwt.claim.sub','eeeeeeee-0000-4000-8000-000000000001',true);
set local role authenticated;
select rentozi_set_user_access('eeeeeeee-0000-4000-8000-000000000002',true,'Rollback restore test');
select set_config('rentozi.test_invite',rentozi_prepare_invitation('tenant','eeeeeeee-0000-4000-8000-000000000031','rentozi-test-tenant-a@example.invalid','ROLLBACK TENANT',null)::text,true);
select pg_temp.assert_true((select auth_user_id is null from tenants where id='eeeeeeee-0000-4000-8000-000000000031'),'Invitation alone does not link another account');
select set_config('request.jwt.claim.sub','eeeeeeee-0000-4000-8000-000000000004',true);
do $$ begin begin perform rentozi_accept_invitation(current_setting('rentozi.test_invite')::uuid);raise exception 'CHECK FAILED: wrong email accepted invitation';exception when insufficient_privilege then null;end;end $$;
select set_config('request.jwt.claim.sub','eeeeeeee-0000-4000-8000-000000000003',true);
select rentozi_accept_invitation(current_setting('rentozi.test_invite')::uuid);
select pg_temp.assert_true((select auth_user_id=auth.uid() from tenants where id='eeeeeeee-0000-4000-8000-000000000031'),'Verified matching recipient accepts tenant link');
select rentozi_accept_invitation(current_setting('rentozi.test_invite')::uuid);
select set_config('request.jwt.claim.sub','eeeeeeee-0000-4000-8000-000000000001',true);
select rentozi_remove_my_tenant_role('eeeeeeee-0000-4000-8000-000000000032');
select pg_temp.assert_true(rentozi_is_platform_owner(),'Own tenant cleanup preserves owner role');
reset role;
select pg_temp.assert_true((select auth_user_id is null and not is_active from tenants where id='eeeeeeee-0000-4000-8000-000000000032'),'Own tenant profile archived and unlinked');
select pg_temp.assert_true((select count(*) from tenant_balances where tenant_id='eeeeeeee-0000-4000-8000-000000000032')=1,'Tenant balance history preserved');
select set_config('request.jwt.claim.role','service_role',true);
set local role service_role;
select pg_temp.assert_true(rentozi_claim_reminder('eeeeeeee-0000-4000-8000-000000000031',current_date,7),'First reminder claim wins');
select pg_temp.assert_true(not rentozi_claim_reminder('eeeeeeee-0000-4000-8000-000000000031',current_date,7),'Concurrent reminder claim blocked');
select pg_temp.assert_true(rentozi_claim_auth_mail(repeat('a',64),repeat('b',64)),'First auth email claim allowed');
select pg_temp.assert_true(not rentozi_claim_auth_mail(repeat('a',64),repeat('b',64)),'Rapid repeat auth email blocked');
reset role;
select 'PASS: owner isolation, owner protection, immediate access revocation, restore, consent and email matching, own tenant cleanup, history retention, reminder claim and auth-mail limits. All fixtures rolled back.' as verification;
rollback;
