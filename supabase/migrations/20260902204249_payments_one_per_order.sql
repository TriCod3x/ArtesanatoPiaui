-- Um pedido tem no máximo um pagamento. Necessário para o `upsert` por
-- `order_id` em createPayment e para evitar corrida entre o webhook e a
-- verificação manual de status.
ALTER TABLE public.payments
  DROP CONSTRAINT IF EXISTS payments_order_id_key;

ALTER TABLE public.payments
  ADD CONSTRAINT payments_order_id_key UNIQUE (order_id);
