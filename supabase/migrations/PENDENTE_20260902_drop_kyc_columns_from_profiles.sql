-- ⚠️ MIGRATION PENDENTE — aplicar manualmente (bloqueada por classificador de DDL destrutivo).
--
-- Estas colunas foram substituídas por public.seller_verifications. A tabela
-- public.profiles é legível por todos (SELECT policy USING true), logo estas
-- colunas nunca devem armazenar dados sensíveis. Hoje elas ficam sempre NULL
-- (o código grava tudo em seller_verifications), mas o ideal é removê-las.
--
-- Rode no SQL editor do Supabase quando for conveniente:

ALTER TABLE public.profiles
  DROP COLUMN IF EXISTS cpf,
  DROP COLUMN IF EXISTS cnpj,
  DROP COLUMN IF EXISTS id_document_url,
  DROP COLUMN IF EXISTS document_status,
  DROP COLUMN IF EXISTS terms_accepted_at;

-- Depois, regenerar os tipos:
--   npx supabase gen types typescript --project-id tyxzyyhgyopwlfdqumyr
-- e remover cpf/cnpj/id_document_url/document_status/terms_accepted_at de
-- src/types/database.ts (Row/Insert/Update de `profiles`).
