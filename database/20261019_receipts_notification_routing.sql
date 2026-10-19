-- Keep tenant receipts private; only authenticated users with existing scoped policies can read.
BEGIN;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.payments'::regclass AND relrowsecurity) OR NOT EXISTS(SELECT 1 FROM pg_policy WHERE polrelid='public.payments'::regclass AND polname='rentozi_payments_read') THEN
  RAISE EXCEPTION 'Expected scoped payments policy is missing; review before granting SELECT';
 END IF;
END $$;
GRANT SELECT ON public.payments TO authenticated;
REVOKE ALL ON public.payments FROM anon;
CREATE OR REPLACE FUNCTION public.landlord_notify_email(p_tenant_id uuid) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE destination text;
BEGIN
 IF NOT public.rentozi_tenant_access(p_tenant_id) THEN RAISE EXCEPTION USING errcode='42501',message='This tenancy is not accessible'; END IF;
 SELECT lower(trim(u.email)) INTO destination FROM public.tenants t JOIN public.landlords l ON l.id=t.landlord_id JOIN auth.users u ON u.id=l.auth_user_id WHERE t.id=p_tenant_id AND u.email_confirmed_at IS NOT NULL;
 IF nullif(destination,'') IS NULL THEN RAISE EXCEPTION 'Landlord has no verified account email';END IF;
 RETURN destination;
END $$;
REVOKE ALL ON FUNCTION public.landlord_notify_email(uuid) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.landlord_notify_email(uuid) TO authenticated;
COMMIT;
