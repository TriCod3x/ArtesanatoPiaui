-- Remove colunas órfãs de profiles — dados de KYC agora vivem em seller_verifications
-- Essas colunas sempre ficaram NULL desde a migration anterior (código nunca escreveu nelas)
ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS cpf,
  DROP COLUMN IF EXISTS cnpj,
  DROP COLUMN IF EXISTS id_document_url,
  DROP COLUMN IF EXISTS document_status,
  DROP COLUMN IF EXISTS terms_accepted_at;
