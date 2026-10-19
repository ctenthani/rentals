BEGIN;
SELECT set_config('request.jwt.claim.sub',(SELECT t.auth_user_id::text FROM public.tenants t WHERE t.auth_user_id IS NOT NULL AND EXISTS(SELECT 1 FROM public.payments p WHERE p.tenant_id=t.id) LIMIT 1),true);
SET LOCAL ROLE authenticated;
DO $$ BEGIN IF NOT EXISTS(SELECT 1 FROM public.payments) THEN RAISE EXCEPTION 'No linked receipt could be read';END IF; IF EXISTS(SELECT 1 FROM public.payments p JOIN public.tenants t ON t.id=p.tenant_id WHERE t.auth_user_id IS DISTINCT FROM auth.uid() AND NOT public.rentozi_manages(t.landlord_id)) THEN RAISE EXCEPTION 'Foreign receipt visible';END IF;END $$;
RESET ROLE;
SET LOCAL ROLE anon;
DO $$ BEGIN BEGIN PERFORM 1 FROM public.payments;RAISE EXCEPTION 'Anonymous read allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;END $$;
RESET ROLE;ROLLBACK;
SELECT 'Tenant receipt read passed; unrelated receipts filtered; anonymous reads blocked' AS verification;