-- O guard é apenas uma função de trigger; não deve ser chamável como RPC.
REVOKE EXECUTE ON FUNCTION public.enforce_seller_verification_review() FROM anon, authenticated, public;
