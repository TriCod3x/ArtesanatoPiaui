-- Integração de pagamento Mercado Pago (split marketplace 1:1: cada loja
-- conecta a própria conta via OAuth). As colunas stores.mp_* e a tabela
-- payments já existiam (provisionadas antes desta migration); aqui apenas
-- corrigimos o modelo pra refletir como o split 1:1 realmente funciona e
-- fechamos duas brechas de segurança encontradas na revisão.

-- 1) payments era UNIQUE(order_id) — um pagamento por pedido inteiro. Isso
-- não serve pro modelo 1:1: cada loja do carrinho tem sua PRÓPRIA conta MP
-- (próprio access_token), então um carrinho multi-loja gera um pagamento
-- (Pix) ou preference (cartão) SEPARADO por loja. Troca pra UNIQUE(order_id, store_id).
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS store_id uuid REFERENCES public.stores(id);

ALTER TABLE public.payments DROP CONSTRAINT IF EXISTS payments_order_id_key;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_order_id_store_id_key UNIQUE (order_id, store_id);

-- Preference (cartão/Checkout Pro) retorna um init_point pra redirecionar o
-- comprador — guardamos separado do pix_qr_code_url (que é a imagem do QR).
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS checkout_url text;

-- Vendedor também precisa ver o status de pagamento das vendas da própria
-- loja (hoje só comprador/admin veem via payments_select_own), espelhando o
-- padrão já usado em order_items ("Comprador e vendedor veem os itens do pedido").
CREATE POLICY "payments_select_store_owner" ON public.payments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.stores s WHERE s.id = payments.store_id AND s.owner_id = auth.uid())
  );

-- 2) mp_access_token/mp_refresh_token são credenciais do vendedor — nunca
-- podem sair pelo PostgREST pro navegador. RLS é por linha, não por coluna:
-- a policy "Lojas ativas visíveis por todos" (status='active' OR owner_id=uid())
-- expõe a linha inteira, então qualquer `select('*')` (ex.: página pública da
-- loja, /minha-loja) vazaria os tokens assim que uma loja conectasse. Revoga
-- as colunas sensíveis dos roles do PostgREST — service_role (usado nas
-- actions/callback/webhook) não é afetado.
REVOKE SELECT (mp_access_token, mp_refresh_token) ON public.stores FROM anon, authenticated;

-- 3) Mesma lógica do enforce_store_status_review: a policy "Vendedor edita
-- sua loja" permite update de qualquer coluna, então o dono poderia forjar
-- mp_connected_at/mp_user_id direto pelo client sem nunca completar o OAuth
-- de verdade. Só o callback (service-role, auth.uid() IS NULL) pode escrever
-- os campos mp_*.
CREATE OR REPLACE FUNCTION public.enforce_store_mp_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.mp_user_id := OLD.mp_user_id;
    NEW.mp_access_token := OLD.mp_access_token;
    NEW.mp_refresh_token := OLD.mp_refresh_token;
    NEW.mp_public_key := OLD.mp_public_key;
    NEW.mp_connected_at := OLD.mp_connected_at;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_store_mp_fields
  BEFORE UPDATE ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.enforce_store_mp_fields();

REVOKE EXECUTE ON FUNCTION public.enforce_store_mp_fields() FROM anon, authenticated, public;
