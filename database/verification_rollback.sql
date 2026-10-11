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
select set_config('request.jwt.claim.sub','eeeeeeee-0000-4000-8000-000000000001',true);
set local role authenticated;
select pg_temp.assert_true((select count(*) from public.tenants where id in ('eeeeeeee-0000-4000-8000-000000000031','eeeeeeee-0000-4000-8000-000000000032'))=1,'Landlord cannot read another business');
select pg_temp.assert_true((select count(*) from public.tenant_overview where tenant_id in ('eeeeeeee-0000-4000-8000-000000000031','eeeeeeee-0000-4000-8000-000000000032'))=1,'Overview respects caller RLS');
do $$ begin
 begin perform public.rentozi_record_payment('eeeeeeee-0000-4000-8000-000000000032',100,'Cash',current_date,'test','eeeeeeee-0000-4000-8000-000000000041'); raise exception 'CHECK FAILED: cross-landlord RPC succeeded'; exception when insufficient_privilege then null; end;
 begin perform public.rentozi_record_payment('eeeeeeee-0000-4000-8000-000000000031',-100,'Cash',current_date,'test','eeeeeeee-0000-4000-8000-000000000041'); raise exception 'CHECK FAILED: negative payment succeeded'; exception when raise_exception then if SQLERRM like 'CHECK FAILED:%' then raise; end if; end;
end $$;
select public.rentozi_record_payment('eeeeeeee-0000-4000-8000-000000000031',400,'Cash',current_date,'test','eeeeeeee-0000-4000-8000-000000000041');
select pg_temp.assert_true((select current_balance=600 and partial_credit=400 from public.tenant_balances where tenant_id='eeeeeeee-0000-4000-8000-000000000031'),'Partial payment persisted atomically');
select pg_temp.assert_true((public.rentozi_record_payment('eeeeeeee-0000-4000-8000-000000000031',400,'Cash',current_date,'test','eeeeeeee-0000-4000-8000-000000000041')->>'already_processed')::boolean,'Retry idempotent');
reset role;
insert into public.payment_submissions(id,tenant_id,amount,method,paid_date,reference_used) values('eeeeeeee-0000-4000-8000-000000000042','eeeeeeee-0000-4000-8000-000000000031',600,'Bank',current_date,'test');
set local role authenticated;
select public.rentozi_review_submission('eeeeeeee-0000-4000-8000-000000000042',true);
select pg_temp.assert_true((public.rentozi_review_submission('eeeeeeee-0000-4000-8000-000000000042',true)->>'already_processed')::boolean,'Approval retry idempotent');
select pg_temp.assert_true((select current_balance=0 and partial_credit=0 and next_due_date=(date_trunc('month',current_date)+interval '1 month')::date from public.tenant_balances where tenant_id='eeeeeeee-0000-4000-8000-000000000031'),'Combined partials clear exactly one month');
select pg_temp.assert_true((select count(*) from public.payments where tenant_id='eeeeeeee-0000-4000-8000-000000000031')=2,'No duplicate ledger rows');
select public.rentozi_reverse_payments(array(select id from public.payments where tenant_id='eeeeeeee-0000-4000-8000-000000000031'),'Rollback verification');
select pg_temp.assert_true((select current_balance=1000 and partial_credit=0 from public.tenant_balances where tenant_id='eeeeeeee-0000-4000-8000-000000000031'),'Reversal restores original balance');
select pg_temp.assert_true((select count(*) from public.payments where tenant_id='eeeeeeee-0000-4000-8000-000000000031' and voided_at is not null)=2,'Reversal preserves audit receipts');
select public.landlord_delete_property('eeeeeeee-0000-4000-8000-000000000031');
select pg_temp.assert_true((select not is_active from public.tenants where id='eeeeeeee-0000-4000-8000-000000000031'),'Archive is recoverable');
select public.rentozi_restore_property('eeeeeeee-0000-4000-8000-000000000031');
select set_config('request.jwt.claim.sub','eeeeeeee-0000-4000-8000-000000000005',true);
select pg_temp.assert_true(public.rentozi_tenant_access('eeeeeeee-0000-4000-8000-000000000031',true),'Co-manager access retained');
select set_config('request.jwt.claim.sub','eeeeeeee-0000-4000-8000-000000000003',true);
select pg_temp.assert_true((select count(*) from public.tenants where id in ('eeeeeeee-0000-4000-8000-000000000031','eeeeeeee-0000-4000-8000-000000000032'))=1,'Tenant sees own records only');
select pg_temp.assert_true(public.rentozi_storage_access('tenant-ids','eeeeeeee-0000-4000-8000-000000000031/id.pdf') and not public.rentozi_storage_access('tenant-ids','eeeeeeee-0000-4000-8000-000000000032/id.pdf'),'Private document scope');
do $$ begin
 begin insert into public.payment_submissions(tenant_id,amount,method,status) values('eeeeeeee-0000-4000-8000-000000000031',100,'Bank','confirmed'); raise exception 'CHECK FAILED: tenant self-approval succeeded'; exception when insufficient_privilege then null; end;
 begin perform public.rentozi_record_payment('eeeeeeee-0000-4000-8000-000000000031',100,'Cash',current_date,'test',gen_random_uuid()); raise exception 'CHECK FAILED: tenant ledger write succeeded'; exception when insufficient_privilege then null; end;
end $$;
reset role;
select 'PASS: permission isolation, private documents, calendar boundaries, partial payments, retries, approval, reversals and archive/restore. All synthetic fixtures and migration changes rolled back.' as verification;
rollback;
