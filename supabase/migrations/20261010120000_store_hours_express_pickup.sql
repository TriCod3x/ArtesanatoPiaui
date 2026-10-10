-- Horario de funcionamento da loja + liberacao da retirada pelo vendedor na
-- entrega expressa (Uber Direct). ARQUIVO PENDENTE DE APLICACAO: revisar antes.
--
-- Ate aqui a Uber era chamada sozinha no settlePayment, assim que o pagamento
-- confirmava. Agora a corrida so e criada quando a artesa clica em "Pronto pra
-- retirada" (shipments.pickup_released_at), e a opcao expressa so e oferecida
-- no checkout dentro do horario configurado da loja.

-- a) Horario por dia da semana. Um intervalo por dia, sem virada de meia-noite
-- (opens < closes). Dia sem linha = loja fechada nesse dia.
CREATE TABLE IF NOT EXISTS public.store_hours (
  store_id uuid NOT NULL REFERENCES public.stores(id) ON DELETE CASCADE,
  weekday smallint NOT NULL CHECK (weekday BETWEEN 0 AND 6), -- 0=domingo .. 6=sabado
  opens time NOT NULL,
  closes time NOT NULL,
  PRIMARY KEY (store_id, weekday),
  CONSTRAINT store_hours_opens_before_closes CHECK (opens < closes)
);

-- b) Preparo e pausa da entrega expressa, por loja.
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS express_prep_minutes integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS express_paused boolean NOT NULL DEFAULT false;

ALTER TABLE public.stores
  DROP CONSTRAINT IF EXISTS stores_express_prep_minutes_check;

ALTER TABLE public.stores
  ADD CONSTRAINT stores_express_prep_minutes_check
  CHECK (express_prep_minutes BETWEEN 10 AND 120);

-- c) Momento em que a artesa liberou a retirada. NULL = ainda nao liberado.
-- Tambem e a "reivindicacao" atomica que impede duas corridas por clique duplo.
ALTER TABLE public.shipments
  ADD COLUMN IF NOT EXISTS pickup_released_at timestamptz;

-- d) RLS no mesmo padrao de store_contacts: leitura publica de lojas ativas
-- (horario nao e dado sensivel), escrita so pelo dono da loja.
ALTER TABLE public.store_hours ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Horarios de lojas ativas visiveis por todos" ON public.store_hours;
CREATE POLICY "Horarios de lojas ativas visiveis por todos"
  ON public.store_hours
  FOR SELECT
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.stores
      WHERE stores.id = store_hours.store_id
        AND stores.status = 'active'::store_status
    )
  );

DROP POLICY IF EXISTS "Vendedor gerencia horarios da sua loja" ON public.store_hours;
CREATE POLICY "Vendedor gerencia horarios da sua loja"
  ON public.store_hours
  FOR ALL
  TO public
  USING (
    EXISTS (
      SELECT 1 FROM public.stores
      WHERE stores.id = store_hours.store_id
        AND stores.owner_id = auth.uid()
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.stores
      WHERE stores.id = store_hours.store_id
        AND stores.owner_id = auth.uid()
    )
  );
