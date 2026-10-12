-- Chat comprador <-> loja com moderacao: fecha falhas de seguranca de
-- `messages`/`conversations`, adiciona bloqueio, denuncia, desativacao de chat,
-- limites de abuso e Realtime. ARQUIVO APLICADA em 2026-10-12: revisar antes.
--
-- O codigo novo (startConversation, sendMessage, bloqueio, denuncia,
-- /admin/denuncias) depende destas tabelas/colunas: aplicar ESTA migration
-- ANTES de subir o codigo.
--
-- Idempotente: IF NOT EXISTS / DROP ... IF EXISTS / CREATE OR REPLACE.
--
-- Antes de aplicar, conferir se ha duplicatas que impediriam os indices
-- unicos da secao 2 (deve retornar 0 linhas):
--   SELECT buyer_id, store_id, product_id, count(*)
--   FROM public.conversations GROUP BY 1, 2, 3 HAVING count(*) > 1;
--
-- Nota sobre RLS: `conversations` e `messages` foram criadas fora do historico
-- de migrations (nao ha registro dos nomes das policies atuais). Por isso a
-- secao 3 dropa DINAMICAMENTE todas as policies das duas tabelas e recria o
-- conjunto completo (SELECT, INSERT e, em messages, UPDATE). Nao ha policy de
-- DELETE de proposito: o chat nao permite apagar mensagem nem conversa.

-- =============================================================================
-- 0) Schema privado para a funcao de bloqueio
-- =============================================================================
-- `chat_blocked_between` fica fora de `public` para NAO ficar exposta como
-- RPC no PostgREST: se ficasse, quem foi bloqueado chamaria a funcao e
-- descobriria o bloqueio ("quem foi bloqueado nao pode saber"). As policies
-- continuam chamando a funcao normalmente (precisam de USAGE + EXECUTE).
CREATE SCHEMA IF NOT EXISTS private;
REVOKE ALL ON SCHEMA private FROM PUBLIC;
GRANT USAGE ON SCHEMA private TO authenticated, service_role;

-- =============================================================================
-- 1) Bloqueios
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.chat_blocks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  blocker_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  blocked_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_blocks_blocker_blocked_key UNIQUE (blocker_id, blocked_id),
  CONSTRAINT chat_blocks_not_self CHECK (blocker_id <> blocked_id)
);

CREATE INDEX IF NOT EXISTS chat_blocks_blocked_id_idx
  ON public.chat_blocks (blocked_id);

ALTER TABLE public.chat_blocks ENABLE ROW LEVEL SECURITY;

GRANT SELECT, INSERT, DELETE ON public.chat_blocks TO authenticated;
GRANT ALL ON public.chat_blocks TO service_role;

-- O usuario so ve, cria e remove os SEUS bloqueios (quem foi bloqueado nao ve
-- a linha).
DROP POLICY IF EXISTS "chat_blocks_select_own" ON public.chat_blocks;
CREATE POLICY "chat_blocks_select_own" ON public.chat_blocks
  FOR SELECT TO authenticated
  USING (blocker_id = auth.uid());

DROP POLICY IF EXISTS "chat_blocks_insert_own" ON public.chat_blocks;
CREATE POLICY "chat_blocks_insert_own" ON public.chat_blocks
  FOR INSERT TO authenticated
  WITH CHECK (blocker_id = auth.uid());

DROP POLICY IF EXISTS "chat_blocks_delete_own" ON public.chat_blocks;
CREATE POLICY "chat_blocks_delete_own" ON public.chat_blocks
  FOR DELETE TO authenticated
  USING (blocker_id = auth.uid());

-- true se existir bloqueio em QUALQUER direcao entre a e b.
CREATE OR REPLACE FUNCTION private.chat_blocked_between(a uuid, b uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.chat_blocks
    WHERE (blocker_id = a AND blocked_id = b)
       OR (blocker_id = b AND blocked_id = a)
  );
$$;

REVOKE ALL ON FUNCTION private.chat_blocked_between(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION private.chat_blocked_between(uuid, uuid)
  TO authenticated, service_role;

-- =============================================================================
-- 2) Colunas, restricoes e indices
-- =============================================================================
-- a) profiles.chat_disabled (desativacao pela moderacao).
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS chat_disabled boolean NOT NULL DEFAULT false;

-- O usuario pode atualizar o proprio profile; sem isto ele reativaria o
-- proprio chat com um UPDATE pelo client. REVOKE de coluna nao funciona aqui
-- (GRANT de tabela prevalece), entao um trigger mantem o valor antigo quando o
-- chamador e anon/authenticated. service_role (as actions de admin) e conexoes
-- diretas do banco passam.
CREATE OR REPLACE FUNCTION public.profiles_guard_chat_disabled()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.chat_disabled IS DISTINCT FROM OLD.chat_disabled
     AND coalesce(auth.role(), '') IN ('anon', 'authenticated') THEN
    NEW.chat_disabled := OLD.chat_disabled;
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.profiles_guard_chat_disabled() FROM PUBLIC;

DROP TRIGGER IF EXISTS profiles_guard_chat_disabled ON public.profiles;
CREATE TRIGGER profiles_guard_chat_disabled
  BEFORE UPDATE OF chat_disabled ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.profiles_guard_chat_disabled();

-- b) conversations.order_id (conversa aberta a partir de um pedido).
ALTER TABLE public.conversations
  ADD COLUMN IF NOT EXISTS order_id uuid NULL
  REFERENCES public.orders(id) ON DELETE SET NULL;

-- c) Unicidade: uma conversa por (comprador, loja, produto); sem produto, uma
-- por (comprador, loja). A conversa existente continua valida (o codigo antigo
-- ja criava uma por par comprador+loja).
CREATE UNIQUE INDEX IF NOT EXISTS conversations_buyer_store_product_key
  ON public.conversations (buyer_id, store_id, product_id)
  WHERE product_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS conversations_buyer_store_no_product_key
  ON public.conversations (buyer_id, store_id)
  WHERE product_id IS NULL;

-- d) messages.content: 1 a 2000 caracteres. NOT VALID + VALIDATE separado:
-- se existir mensagem antiga fora da regra a migration nao quebra, so avisa
-- (a regra vale para toda linha nova ou atualizada).
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'messages_content_length_check'
      AND conrelid = 'public.messages'::regclass
  ) THEN
    ALTER TABLE public.messages
      ADD CONSTRAINT messages_content_length_check
      CHECK (char_length(btrim(content)) BETWEEN 1 AND 2000) NOT VALID;
  END IF;
END $$;

DO $$
BEGIN
  ALTER TABLE public.messages VALIDATE CONSTRAINT messages_content_length_check;
EXCEPTION WHEN check_violation THEN
  RAISE NOTICE 'messages_content_length_check: ha mensagens antigas fora de 1..2000 caracteres; constraint ficou NOT VALID.';
END $$;

-- e) Indices de leitura e de apoio aos limites.
CREATE INDEX IF NOT EXISTS messages_conversation_created_idx
  ON public.messages (conversation_id, created_at DESC);

CREATE INDEX IF NOT EXISTS messages_conversation_unread_idx
  ON public.messages (conversation_id)
  WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS messages_sender_created_idx
  ON public.messages (sender_id, created_at DESC);

CREATE INDEX IF NOT EXISTS conversations_buyer_created_idx
  ON public.conversations (buyer_id, created_at DESC);

-- =============================================================================
-- 3) Policies e grants de conversations / messages
-- =============================================================================
ALTER TABLE public.conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname, tablename FROM pg_policies
    WHERE schemaname = 'public' AND tablename IN ('conversations', 'messages')
  LOOP
    EXECUTE format('DROP POLICY %I ON public.%I', pol.policyname, pol.tablename);
  END LOOP;
END $$;

-- Falha confirmada: qualquer participante dava UPDATE em content/sender_id de
-- uma mensagem e em buyer_id de uma conversa. Em messages so `read_at` e
-- atualizavel pelo client. Em conversations nenhum campo: o app atualiza
-- last_message_at pela action sendMessage com o service role (nao ha trigger
-- nem UPDATE pelo client), e service_role nao e afetado por este REVOKE.
REVOKE UPDATE ON public.messages FROM anon, authenticated;
GRANT UPDATE (read_at) ON public.messages TO authenticated;

REVOKE UPDATE ON public.conversations FROM anon, authenticated;

-- SELECT: so os dois participantes (comprador e dono da loja). Admin NAO le
-- mensagens: ve apenas o snapshot da denuncia.
CREATE POLICY "conversations_select_participants" ON public.conversations
  FOR SELECT TO authenticated
  USING (
    buyer_id = auth.uid()
    OR EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = conversations.store_id AND s.owner_id = auth.uid()
    )
  );

-- INSERT: so o comprador, nunca na propria loja; produto da loja; pedido do
-- comprador com item da loja; sem bloqueio entre as partes.
CREATE POLICY "conversations_insert_buyer" ON public.conversations
  FOR INSERT TO authenticated
  WITH CHECK (
    buyer_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = conversations.store_id
        AND s.owner_id <> auth.uid()
        AND NOT private.chat_blocked_between(auth.uid(), s.owner_id)
    )
    AND (
      conversations.product_id IS NULL
      OR EXISTS (
        SELECT 1 FROM public.products p
        WHERE p.id = conversations.product_id
          AND p.store_id = conversations.store_id
      )
    )
    AND (
      conversations.order_id IS NULL
      OR EXISTS (
        SELECT 1
        FROM public.orders o
        JOIN public.order_items oi ON oi.order_id = o.id
        WHERE o.id = conversations.order_id
          AND o.buyer_id = auth.uid()
          AND oi.store_id = conversations.store_id
      )
    )
  );

CREATE POLICY "messages_select_participants" ON public.messages
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM public.conversations c
      JOIN public.stores s ON s.id = c.store_id
      WHERE c.id = messages.conversation_id
        AND (c.buyer_id = auth.uid() OR s.owner_id = auth.uid())
    )
  );

-- INSERT: remetente = quem esta logado, participante, sem bloqueio entre as
-- partes (a falha e a mesma de qualquer RLS: o bloqueado nao distingue).
CREATE POLICY "messages_insert_participant" ON public.messages
  FOR INSERT TO authenticated
  WITH CHECK (
    sender_id = auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.conversations c
      JOIN public.stores s ON s.id = c.store_id
      WHERE c.id = messages.conversation_id
        AND (c.buyer_id = auth.uid() OR s.owner_id = auth.uid())
        AND NOT private.chat_blocked_between(c.buyer_id, s.owner_id)
    )
  );

-- UPDATE (so read_at, pelo GRANT acima): so quem RECEBE a mensagem marca como
-- lida.
CREATE POLICY "messages_update_read_status" ON public.messages
  FOR UPDATE TO authenticated
  USING (
    sender_id <> auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.conversations c
      JOIN public.stores s ON s.id = c.store_id
      WHERE c.id = messages.conversation_id
        AND (c.buyer_id = auth.uid() OR s.owner_id = auth.uid())
    )
  )
  WITH CHECK (
    sender_id <> auth.uid()
    AND EXISTS (
      SELECT 1
      FROM public.conversations c
      JOIN public.stores s ON s.id = c.store_id
      WHERE c.id = messages.conversation_id
        AND (c.buyer_id = auth.uid() OR s.owner_id = auth.uid())
    )
  );

-- =============================================================================
-- 4) Denuncias
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.chat_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reported_user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- SET NULL: a evidencia (snapshot) sobrevive a conversa.
  conversation_id uuid REFERENCES public.conversations(id) ON DELETE SET NULL,
  reason text NOT NULL,
  details text,
  snapshot jsonb NOT NULL,
  status text NOT NULL DEFAULT 'open',
  admin_note text,
  reviewed_by uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT chat_reports_reason_check
    CHECK (reason IN ('spam', 'golpe', 'assedio', 'conteudo_improprio', 'outro')),
  CONSTRAINT chat_reports_details_check
    CHECK (details IS NULL OR char_length(details) <= 500),
  CONSTRAINT chat_reports_status_check
    CHECK (status IN ('open', 'reviewed', 'dismissed', 'actioned'))
);

CREATE INDEX IF NOT EXISTS chat_reports_status_created_idx
  ON public.chat_reports (status, created_at DESC);
CREATE INDEX IF NOT EXISTS chat_reports_reported_created_idx
  ON public.chat_reports (reported_user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS chat_reports_reporter_conversation_idx
  ON public.chat_reports (reporter_id, conversation_id, created_at DESC);

ALTER TABLE public.chat_reports ENABLE ROW LEVEL SECURITY;

-- Sem policy de INSERT: a gravacao e pela action, com service role, para o
-- snapshot nao poder ser forjado pelo cliente. O admin so atualiza os campos
-- de revisao (nunca o snapshot).
REVOKE ALL ON public.chat_reports FROM anon, authenticated;
GRANT SELECT ON public.chat_reports TO authenticated;
GRANT UPDATE (status, admin_note, reviewed_by, reviewed_at)
  ON public.chat_reports TO authenticated;
GRANT ALL ON public.chat_reports TO service_role;

DROP POLICY IF EXISTS "chat_reports_select_admin" ON public.chat_reports;
CREATE POLICY "chat_reports_select_admin" ON public.chat_reports
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

DROP POLICY IF EXISTS "chat_reports_update_admin" ON public.chat_reports;
CREATE POLICY "chat_reports_update_admin" ON public.chat_reports
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- =============================================================================
-- 5) Limites de abuso (BEFORE INSERT)
-- =============================================================================
-- Mensagens de erro curtas e estaveis; a action traduz.
--   chat_rate_limit_conversations | chat_rate_limit_messages | chat_disabled
CREATE OR REPLACE FUNCTION public.chat_conversations_rate_limit()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF (
    SELECT count(*) FROM public.conversations
    WHERE buyer_id = NEW.buyer_id
      AND created_at > now() - interval '24 hours'
  ) >= 15 THEN
    RAISE EXCEPTION 'chat_rate_limit_conversations' USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.chat_messages_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = NEW.sender_id AND chat_disabled
  ) THEN
    RAISE EXCEPTION 'chat_disabled' USING ERRCODE = 'P0001';
  END IF;

  IF (
    SELECT count(*) FROM public.messages
    WHERE sender_id = NEW.sender_id
      AND created_at > now() - interval '60 seconds'
  ) >= 20 THEN
    RAISE EXCEPTION 'chat_rate_limit_messages' USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.chat_conversations_rate_limit() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.chat_messages_guard() FROM PUBLIC;

DROP TRIGGER IF EXISTS chat_conversations_rate_limit ON public.conversations;
CREATE TRIGGER chat_conversations_rate_limit
  BEFORE INSERT ON public.conversations
  FOR EACH ROW EXECUTE FUNCTION public.chat_conversations_rate_limit();

DROP TRIGGER IF EXISTS chat_messages_guard ON public.messages;
CREATE TRIGGER chat_messages_guard
  BEFORE INSERT ON public.messages
  FOR EACH ROW EXECUTE FUNCTION public.chat_messages_guard();

-- =============================================================================
-- 6) Realtime
-- =============================================================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public' AND tablename = 'messages'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.messages;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public' AND tablename = 'conversations'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.conversations;
  END IF;
END $$;
