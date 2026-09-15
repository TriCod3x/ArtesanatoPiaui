-- CORREÇÃO DE SEGURANÇA: as migrations anteriores (20260914150000,
-- 20260914170000) tentaram proteger mp_access_token/mp_refresh_token/
-- melhorenvio_access_token/melhorenvio_refresh_token com
-- `REVOKE SELECT (...) ON stores FROM anon, authenticated`. Testando de
-- verdade (não só lendo o retorno da migration): o REVOKE NÃO se sustentou —
-- `has_column_privilege('authenticated', 'stores', 'mp_access_token', 'SELECT')`
-- continuava `true`, e a página pública de produto (select `store:stores(*)`)
-- provou isso na prática. RLS é por LINHA nesse ambiente Supabase e funciona
-- (confirmado em toda a policy já usada no projeto); REVOKE por COLUNA não.
--
-- Correção: usa o MESMO padrão já validado em `seller_verifications`
-- (20260902005208_seller_verifications_private_table.sql) — tabela isolada,
-- SEM NENHUMA policy pra anon/authenticated (nem o dono da loja lê essa
-- tabela pela própria sessão). Só service_role (admin client, em código já
-- gated) lê/escreve. Status de conexão pra UI vem de uma leitura própria no
-- servidor, nunca do valor bruto do token.

CREATE TABLE public.store_integration_credentials (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  provider text NOT NULL CHECK (provider IN ('mercadopago', 'melhorenvio')),
  external_user_id text,
  access_token text NOT NULL,
  refresh_token text,
  public_key text,
  connected_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (store_id, provider)
);

ALTER TABLE public.store_integration_credentials ENABLE ROW LEVEL SECURITY;
-- Nenhuma CREATE POLICY aqui de propósito: RLS ligado + zero policies =
-- default deny total pra anon/authenticated. Só service_role (bypassa RLS).

DROP TRIGGER IF EXISTS trg_enforce_store_mp_fields ON public.stores;
DROP FUNCTION IF EXISTS public.enforce_store_mp_fields();
DROP TRIGGER IF EXISTS trg_enforce_store_melhorenvio_fields ON public.stores;
DROP FUNCTION IF EXISTS public.enforce_store_melhorenvio_fields();

-- Nenhuma loja tinha token gravado ainda (nenhuma conexão OAuth real foi
-- completada nesta sandbox) — confirmado antes de rodar, sem necessidade de
-- migrar dados.
ALTER TABLE public.stores
  DROP COLUMN IF EXISTS mp_user_id,
  DROP COLUMN IF EXISTS mp_access_token,
  DROP COLUMN IF EXISTS mp_refresh_token,
  DROP COLUMN IF EXISTS mp_public_key,
  DROP COLUMN IF EXISTS mp_connected_at,
  DROP COLUMN IF EXISTS melhorenvio_user_id,
  DROP COLUMN IF EXISTS melhorenvio_access_token,
  DROP COLUMN IF EXISTS melhorenvio_refresh_token,
  DROP COLUMN IF EXISTS melhorenvio_connected_at;
