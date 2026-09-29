-- A policy pública "Produtos ativos visíveis por todos" só olhava
-- products.status = 'active' e não considerava se a LOJA foi aprovada —
-- produto de loja pending/suspended continuava visível pra qualquer um.
-- Recria a mesma policy (mesmo nome, pra não duplicar a regra) exigindo
-- também stores.status = 'active'. A cláusula do dono da loja é uma policy
-- separada e não é tocada aqui.
DROP POLICY IF EXISTS "Produtos ativos visíveis por todos" ON public.products;

CREATE POLICY "Produtos ativos visíveis por todos" ON public.products
  FOR SELECT
  USING (
    status = 'active'
    AND EXISTS (
      SELECT 1 FROM public.stores s
      WHERE s.id = products.store_id AND s.status = 'active'
    )
  );

-- Sem isso, o comprador perde a visão de produtos de pedidos antigos assim
-- que a loja é suspensa DEPOIS da compra: a policy acima passa a esconder a
-- linha e "Meus pedidos" cai para "Produto removido" mesmo o produto
-- existindo. Esta policy é adicional (OR) e só libera o produto para quem
-- de fato comprou — não afrouxa a visibilidade pública.
CREATE POLICY "products_select_own_order_history" ON public.products
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1
      FROM public.order_items oi
      JOIN public.orders o ON o.id = oi.order_id
      WHERE oi.product_id = products.id AND o.buyer_id = auth.uid()
    )
  );
