-- ============================================================
-- FASE 1: Requisitos de loja (KYC-lite)
-- ============================================================

-- Dados pessoais/documento do vendedor (tabela profiles) — SUPERSEDIDO
-- pela migration 20260902005208 (movido para public.seller_verifications).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS cpf TEXT,
  ADD COLUMN IF NOT EXISTS cnpj TEXT,
  ADD COLUMN IF NOT EXISTS id_document_url TEXT,
  ADD COLUMN IF NOT EXISTS document_status TEXT NOT NULL DEFAULT 'pending'
    CHECK (document_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS terms_accepted_at TIMESTAMPTZ;

-- Endereço completo da loja
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS cep TEXT,
  ADD COLUMN IF NOT EXISTS address_street TEXT,
  ADD COLUMN IF NOT EXISTS address_number TEXT,
  ADD COLUMN IF NOT EXISTS address_complement TEXT,
  ADD COLUMN IF NOT EXISTS address_neighborhood TEXT;

-- Bucket PRIVADO para documentos de identidade (NUNCA público)
INSERT INTO storage.buckets (id, name, public)
VALUES ('identity-documents', 'identity-documents', false)
ON CONFLICT (id) DO NOTHING;

-- RLS do storage: só o dono do documento e admin podem ver
CREATE POLICY "identity_docs_owner_select"
  ON storage.objects FOR SELECT
  USING (
    bucket_id = 'identity-documents'
    AND (
      auth.uid()::text = (storage.foldername(name))[1]
      OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
    )
  );

CREATE POLICY "identity_docs_owner_insert"
  ON storage.objects FOR INSERT
  WITH CHECK (
    bucket_id = 'identity-documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );

CREATE POLICY "identity_docs_owner_delete"
  ON storage.objects FOR DELETE
  USING (
    bucket_id = 'identity-documents'
    AND auth.uid()::text = (storage.foldername(name))[1]
  );
