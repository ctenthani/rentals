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
-- The sending allowlist must use the same verified landlord destination.
CREATE OR REPLACE FUNCTION public.rentozi_email_recipient(p_email text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE n integer;cap integer;
BEGIN
 IF NOT public.rentozi_user_enabled() THEN RETURN false;END IF;
 IF NOT ((public.rentozi_is_platform_owner() AND lower(trim(p_email))=(SELECT lower(email) FROM auth.users WHERE id=auth.uid()))
 OR EXISTS(SELECT 1 FROM public.landlords l JOIN auth.users u ON u.id=l.auth_user_id WHERE public.rentozi_manages(l.id) AND u.email_confirmed_at IS NOT NULL AND lower(trim(u.email))=lower(trim(p_email)))
 OR EXISTS(SELECT 1 FROM public.tenants t JOIN public.landlords l ON l.id=t.landlord_id JOIN auth.users u ON u.id=l.auth_user_id WHERE (public.rentozi_manages(l.id) AND lower(trim(t.email))=lower(trim(p_email))) OR (t.auth_user_id=auth.uid() AND u.email_confirmed_at IS NOT NULL AND lower(trim(u.email))=lower(trim(p_email))))) THEN RETURN false;END IF;
 cap=CASE WHEN public.rentozi_is_platform_owner() OR EXISTS(SELECT 1 FROM public.landlords l WHERE public.rentozi_manages(l.id)) THEN 100 ELSE 10 END;
 INSERT INTO public.rentozi_email_limits(actor_id,hour,count) VALUES(auth.uid(),date_trunc('hour',now()),1) ON CONFLICT(actor_id,hour) DO UPDATE SET count=rentozi_email_limits.count+1 RETURNING count INTO n;
 RETURN n<=cap;
END $$;
REVOKE ALL ON FUNCTION public.rentozi_email_recipient(text) FROM public,anon;
GRANT EXECUTE ON FUNCTION public.rentozi_email_recipient(text) TO authenticated;
COMMIT;
