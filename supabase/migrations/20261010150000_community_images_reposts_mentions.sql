-- Comunidade: ate 6 imagens por post, republicar e marcar com @ (usuarios e
-- lojas). ARQUIVO APLICADA em 2026-10-12: revisar antes.
--
-- O codigo novo (leitura do feed, createPost, toggleRepost) depende destas
-- tabelas: aplicar ESTA migration ANTES de subir o codigo.
--
-- Idempotente: IF NOT EXISTS / DROP POLICY IF EXISTS / backfill com
-- ON CONFLICT DO NOTHING. Nao apaga community_posts.image_url (compatibilidade
-- de leitura: post sem linhas em community_post_images mostra o image_url).
--
-- Nota sobre RLS: as policies atuais de community_posts/post_likes/
-- post_comments nao estao no historico de migrations (as tabelas foram criadas
-- fora dele). O que foi verificado: leitura anonima (anon key) de
-- community_posts, post_likes e post_comments devolve 200 — SELECT publico. As
-- policies abaixo seguem esse padrao e o do resto do projeto (escrita presa a
-- auth.uid()).

-- a) Imagens do post (0..5 = ate 6 imagens, ordem de exibicao).
CREATE TABLE IF NOT EXISTS public.community_post_images (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  url text NOT NULL,
  position smallint NOT NULL CHECK (position BETWEEN 0 AND 5),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_post_images_post_position_key UNIQUE (post_id, position)
);

CREATE INDEX IF NOT EXISTS community_post_images_post_id_idx
  ON public.community_post_images (post_id);

ALTER TABLE public.community_post_images ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Imagens de posts visiveis por todos" ON public.community_post_images;
CREATE POLICY "Imagens de posts visiveis por todos"
  ON public.community_post_images
  FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS "Autor insere imagens do proprio post" ON public.community_post_images;
CREATE POLICY "Autor insere imagens do proprio post"
  ON public.community_post_images
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.community_posts p
      WHERE p.id = community_post_images.post_id
        AND p.author_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Autor remove imagens do proprio post" ON public.community_post_images;
CREATE POLICY "Autor remove imagens do proprio post"
  ON public.community_post_images
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.community_posts p
      WHERE p.id = community_post_images.post_id
        AND p.author_id = auth.uid()
    )
  );

-- Backfill: cada image_url existente vira a imagem de posicao 0.
INSERT INTO public.community_post_images (post_id, url, position)
SELECT p.id, p.image_url, 0
FROM public.community_posts p
WHERE p.image_url IS NOT NULL
ON CONFLICT (post_id, position) DO NOTHING;

-- b) Republicacoes. Aponta SEMPRE pro post original (nao existe "republicar
-- uma republicacao": a republicacao nao e um post).
CREATE TABLE IF NOT EXISTS public.community_reposts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_reposts_post_user_key UNIQUE (post_id, user_id)
);

CREATE INDEX IF NOT EXISTS community_reposts_post_id_idx
  ON public.community_reposts (post_id);
CREATE INDEX IF NOT EXISTS community_reposts_user_id_idx
  ON public.community_reposts (user_id);
CREATE INDEX IF NOT EXISTS community_reposts_created_at_idx
  ON public.community_reposts (created_at DESC);

ALTER TABLE public.community_reposts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Republicacoes visiveis por todos" ON public.community_reposts;
CREATE POLICY "Republicacoes visiveis por todos"
  ON public.community_reposts
  FOR SELECT
  TO public
  USING (true);

-- So em post de OUTRO autor, e so em nome de si mesmo.
DROP POLICY IF EXISTS "Usuario republica post de outro autor" ON public.community_reposts;
CREATE POLICY "Usuario republica post de outro autor"
  ON public.community_reposts
  FOR INSERT
  TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.community_posts p
      WHERE p.id = community_reposts.post_id
        AND p.author_id <> auth.uid()
    )
  );

DROP POLICY IF EXISTS "Usuario remove a propria republicacao" ON public.community_reposts;
CREATE POLICY "Usuario remove a propria republicacao"
  ON public.community_reposts
  FOR DELETE
  TO authenticated
  USING (user_id = auth.uid());

-- c) Marcacoes (@) no post: usuario OU loja, nunca os dois.
CREATE TABLE IF NOT EXISTS public.community_post_mentions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL REFERENCES public.community_posts(id) ON DELETE CASCADE,
  mentioned_user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  mentioned_store_id uuid REFERENCES public.stores(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT community_post_mentions_one_target
    CHECK (num_nonnulls(mentioned_user_id, mentioned_store_id) = 1)
);

CREATE UNIQUE INDEX IF NOT EXISTS community_post_mentions_post_user_key
  ON public.community_post_mentions (post_id, mentioned_user_id)
  WHERE mentioned_user_id IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS community_post_mentions_post_store_key
  ON public.community_post_mentions (post_id, mentioned_store_id)
  WHERE mentioned_store_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS community_post_mentions_post_id_idx
  ON public.community_post_mentions (post_id);
CREATE INDEX IF NOT EXISTS community_post_mentions_user_id_idx
  ON public.community_post_mentions (mentioned_user_id)
  WHERE mentioned_user_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS community_post_mentions_store_id_idx
  ON public.community_post_mentions (mentioned_store_id)
  WHERE mentioned_store_id IS NOT NULL;

ALTER TABLE public.community_post_mentions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Marcacoes visiveis por todos" ON public.community_post_mentions;
CREATE POLICY "Marcacoes visiveis por todos"
  ON public.community_post_mentions
  FOR SELECT
  TO public
  USING (true);

DROP POLICY IF EXISTS "Autor registra marcacoes do proprio post" ON public.community_post_mentions;
CREATE POLICY "Autor registra marcacoes do proprio post"
  ON public.community_post_mentions
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.community_posts p
      WHERE p.id = community_post_mentions.post_id
        AND p.author_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Autor remove marcacoes do proprio post" ON public.community_post_mentions;
CREATE POLICY "Autor remove marcacoes do proprio post"
  ON public.community_post_mentions
  FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.community_posts p
      WHERE p.id = community_post_mentions.post_id
        AND p.author_id = auth.uid()
    )
  );
