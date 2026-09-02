-- Move os dados sensíveis de KYC para uma tabela isolada com RLS estrita.
-- A tabela public.profiles é legível por todos (SELECT USING true), então
-- CPF/CNPJ/documento NÃO podem viver lá.

CREATE TABLE IF NOT EXISTS public.seller_verifications (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  cpf text NOT NULL,
  cnpj text,
  cep text NOT NULL,
  address_street text NOT NULL,
  address_number text NOT NULL,
  address_complement text,
  address_neighborhood text NOT NULL,
  address_city text NOT NULL,
  address_state text NOT NULL,
  id_document_path text,
  document_status text NOT NULL DEFAULT 'pending'
    CHECK (document_status IN ('pending', 'approved', 'rejected')),
  rejection_reason text,
  terms_accepted_at timestamptz,
  submitted_at timestamptz NOT NULL DEFAULT now(),
  reviewed_at timestamptz,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.seller_verifications ENABLE ROW LEVEL SECURITY;

CREATE INDEX IF NOT EXISTS seller_verifications_status_idx
  ON public.seller_verifications (document_status);

-- Só o dono ou um admin podem ler uma verificação (nunca páginas públicas).
CREATE POLICY "sv_select_own_or_admin" ON public.seller_verifications
  FOR SELECT USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

CREATE POLICY "sv_insert_own" ON public.seller_verifications
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "sv_update_own_or_admin" ON public.seller_verifications
  FOR UPDATE USING (
    user_id = auth.uid()
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

-- Guard: um não-admin (o próprio vendedor) nunca pode avançar o próprio
-- status de análise. Chamadas via service-role (auth.uid() IS NULL) e admins passam.
CREATE OR REPLACE FUNCTION public.enforce_seller_verification_review()
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
    NEW.document_status := 'pending';
    NEW.rejection_reason := NULL;
    NEW.reviewed_at := NULL;
    NEW.reviewed_by := NULL;
  END IF;

  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_seller_verification_review
  BEFORE INSERT OR UPDATE ON public.seller_verifications
  FOR EACH ROW EXECUTE FUNCTION public.enforce_seller_verification_review();

-- Restringe o bucket privado de documentos (5MB, apenas jpg/png/pdf).
UPDATE storage.buckets
  SET file_size_limit = 5242880,
      allowed_mime_types = ARRAY['image/jpeg', 'image/png', 'application/pdf']
  WHERE id = 'identity-documents';
