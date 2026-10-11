DROP POLICY IF EXISTS "Autor insere imagens do proprio post" ON public.community_post_images;
CREATE POLICY "Autor insere imagens do proprio post" ON public.community_post_images
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.community_posts p
      WHERE p.id = community_post_images.post_id AND p.author_id = auth.uid()
    )
    AND starts_with(
      url,
      'https://tyxzyyhgyopwlfdqumyr.supabase.co/storage/v1/object/public/community-posts/' || auth.uid()::text || '/'
    )
  );
