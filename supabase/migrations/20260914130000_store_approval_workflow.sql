-- Fluxo de aprovação da loja pelo admin (separado da aprovação do documento
-- de identidade em seller_verifications). Guarda o motivo de suspensão e
-- impede que o próprio vendedor mude o status da loja diretamente.

ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS rejection_reason text;

-- Admin precisa enxergar lojas pending/suspended para o painel de aprovação.
-- O dono já enxerga a própria loja via "Lojas ativas visíveis por todos"
-- (status = 'active' OR owner_id = auth.uid()); páginas públicas continuam
-- só vendo status = 'active', já que essa nova policy é permissiva (OR).
CREATE POLICY "stores_select_admin" ON public.stores
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- Guard: a policy "Vendedor edita sua loja" permite ao dono atualizar
-- qualquer coluna da própria loja, inclusive `status` — sem isso, o vendedor
-- poderia se auto-aprovar (status = 'active') direto pelo client. Só admin
-- ou uma chamada via service-role (auth.uid() IS NULL, usada pelas actions
-- de admin/reenvio já gated em código) podem alterar status/rejection_reason.
CREATE OR REPLACE FUNCTION public.enforce_store_status_review()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  is_privileged boolean;
BEGIN
  is_privileged := auth.uid() IS NULL
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin');

  IF NOT is_privileged THEN
    NEW.status := OLD.status;
    NEW.rejection_reason := OLD.rejection_reason;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_store_status_review
  BEFORE UPDATE ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.enforce_store_status_review();

REVOKE EXECUTE ON FUNCTION public.enforce_store_status_review() FROM anon, authenticated, public;
