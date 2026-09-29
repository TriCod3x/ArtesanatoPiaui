-- Fecha uma brecha: hoje a policy de INSERT em `reviews` só exige
-- `auth.uid() = buyer_id`, então qualquer usuário logado avalia qualquer
-- produto, mesmo sem ter comprado. `reviews.order_item_id` aceita NULL (o
-- UNIQUE da coluna não vale pra NULL), então também dava pra inserir quantas
-- avaliações quisesse pro mesmo produto.
--
-- A tabela `reviews` foi criada fora do histórico de migrations (não há
-- registro do nome exato da policy atual), então este bloco dropa
-- dinamicamente qualquer policy de INSERT já existente antes de recriar.
DO $$
DECLARE
  pol record;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies
    WHERE schemaname = 'public' AND tablename = 'reviews' AND cmd = 'INSERT'
  LOOP
    EXECUTE format('DROP POLICY %I ON public.reviews', pol.policyname);
  END LOOP;
END $$;

-- Exige, todos juntos:
--  - buyer_id = auth.uid()
--  - order_item_id não é NULL (não muda a nullability da coluna — a FK
--    continua ON DELETE SET NULL, isso só afeta o que pode ser inserido)
--  - o order_item pertence a um pedido do próprio auth.uid()
--  - o item já foi entregue (order_items.item_status = 'delivered')
--  - product_id e store_id da review batem com os do order_item
--  - auth.uid() não é o dono da loja avaliada
CREATE POLICY "reviews_insert_eligible_buyer" ON public.reviews
  FOR INSERT
  WITH CHECK (
    buyer_id = auth.uid()
    AND order_item_id IS NOT NULL
    AND EXISTS (
      SELECT 1
      FROM public.order_items oi
      JOIN public.orders o ON o.id = oi.order_id
      WHERE oi.id = reviews.order_item_id
        AND o.buyer_id = auth.uid()
        AND oi.item_status = 'delivered'
        AND oi.product_id = reviews.product_id
        AND oi.store_id = reviews.store_id
    )
    AND NOT EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = reviews.store_id AND s.owner_id = auth.uid()
    )
  );
