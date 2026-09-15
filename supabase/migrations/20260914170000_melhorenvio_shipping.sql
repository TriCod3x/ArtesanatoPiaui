-- Frete via Melhor Envio (split 1:1: cada loja conecta a própria conta via
-- OAuth). stores.melhorenvio_* e a tabela shipments já existiam
-- (provisionadas antes desta migration); aqui: (1) endereço de entrega do
-- pedido — não existia em lugar nenhum, precisa pra calcular/comprar frete —
-- e (2) as mesmas duas proteções já aplicadas aos tokens do Mercado Pago.

-- 1) Endereço de entrega — snapshot no pedido (não um cadastro de endereços
-- reutilizável; esse app não tem isso hoje pra comprador, e não é o escopo
-- desta feature). Nullable pq pedidos antigos (antes desta migration) não têm.
ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS shipping_name text,
  ADD COLUMN IF NOT EXISTS shipping_phone text,
  ADD COLUMN IF NOT EXISTS shipping_cep text,
  ADD COLUMN IF NOT EXISTS shipping_street text,
  ADD COLUMN IF NOT EXISTS shipping_number text,
  ADD COLUMN IF NOT EXISTS shipping_complement text,
  ADD COLUMN IF NOT EXISTS shipping_neighborhood text,
  ADD COLUMN IF NOT EXISTS shipping_city text,
  ADD COLUMN IF NOT EXISTS shipping_state text;

-- 2) melhorenvio_access_token/melhorenvio_refresh_token são credenciais do
-- vendedor — mesma brecha que corrigimos pros tokens do Mercado Pago
-- (REVOKE SELECT (mp_access_token, mp_refresh_token) ... em
-- 20260914150000_mercadopago_payments_split.sql): a policy "Lojas ativas
-- visíveis por todos" expõe a linha inteira pra qualquer `select('*')`.
REVOKE SELECT (melhorenvio_access_token, melhorenvio_refresh_token) ON public.stores FROM anon, authenticated;

-- Mesmo trigger-guard de enforce_store_mp_fields, mas pros campos
-- melhorenvio_* — só o callback (service-role, auth.uid() IS NULL) escreve.
CREATE OR REPLACE FUNCTION public.enforce_store_melhorenvio_fields()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    NEW.melhorenvio_user_id := OLD.melhorenvio_user_id;
    NEW.melhorenvio_access_token := OLD.melhorenvio_access_token;
    NEW.melhorenvio_refresh_token := OLD.melhorenvio_refresh_token;
    NEW.melhorenvio_connected_at := OLD.melhorenvio_connected_at;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_enforce_store_melhorenvio_fields
  BEFORE UPDATE ON public.stores
  FOR EACH ROW EXECUTE FUNCTION public.enforce_store_melhorenvio_fields();

REVOKE EXECUTE ON FUNCTION public.enforce_store_melhorenvio_fields() FROM anon, authenticated, public;
