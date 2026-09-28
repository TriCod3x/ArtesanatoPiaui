-- Entrega expressa (Uber Direct) passa a conviver com o Melhor Envio no mesmo
-- pedido, então shipments precisa dizer QUEM entrega: o service_id sozinho não
-- serve (Melhor Envio usa id numérico de serviço, a Uber Direct não tem esse
-- conceito e é marcada com a constante 'uber-direct' — ver UBER_DIRECT_SERVICE_ID
-- em src/lib/constants.ts).

ALTER TABLE public.shipments
  ADD COLUMN IF NOT EXISTS carrier text NOT NULL DEFAULT 'melhorenvio';

-- Backfill dos registros já existentes a partir do service_id gravado.
UPDATE public.shipments
SET carrier = 'uber_direct'
WHERE service_id = 'uber-direct';

UPDATE public.shipments
SET carrier = 'melhorenvio'
WHERE service_id IS DISTINCT FROM 'uber-direct';

ALTER TABLE public.shipments
  DROP CONSTRAINT IF EXISTS shipments_carrier_check;

ALTER TABLE public.shipments
  ADD CONSTRAINT shipments_carrier_check
  CHECK (carrier IN ('melhorenvio', 'uber_direct'));

-- Campos da entrega expressa. uber_delivery_id é o id devolvido pelo
-- POST /v1/customers/{id}/deliveries; uber_delivery_status guarda o status cru
-- da Uber (o status normalizado do app continua em shipments.status).
ALTER TABLE public.shipments
  ADD COLUMN IF NOT EXISTS uber_delivery_id text,
  ADD COLUMN IF NOT EXISTS uber_delivery_status text,
  ADD COLUMN IF NOT EXISTS uber_tracking_url text,
  -- Nota de falha na entrega expressa: preenchida quando createDelivery() não
  -- passa, pra separar "ainda não despachado" de "falhou, precisa de gente".
  ADD COLUMN IF NOT EXISTS fulfillment_note text;

-- O webhook da Uber chega com o delivery_id; sem índice isso vira seq scan.
CREATE INDEX IF NOT EXISTS shipments_uber_delivery_id_idx
  ON public.shipments (uber_delivery_id)
  WHERE uber_delivery_id IS NOT NULL;
