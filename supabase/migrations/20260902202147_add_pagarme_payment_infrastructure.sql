-- ============================================================
-- FASE 3: Infraestrutura de pagamento (Pagar.me)
-- ============================================================

-- Dados bancários do vendedor (para criação do recebedor/recipient)
ALTER TABLE public.seller_verifications
  ADD COLUMN IF NOT EXISTS bank_code TEXT,
  ADD COLUMN IF NOT EXISTS bank_agency TEXT,
  ADD COLUMN IF NOT EXISTS bank_account TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_digit TEXT,
  ADD COLUMN IF NOT EXISTS bank_account_type TEXT
    CHECK (bank_account_type IN ('checking', 'savings')),
  ADD COLUMN IF NOT EXISTS pagarme_recipient_id TEXT;

-- Espelha o recipient_id na loja para acesso rápido no checkout
ALTER TABLE public.stores
  ADD COLUMN IF NOT EXISTS pagarme_recipient_id TEXT;

-- Tabela de pagamentos (um pedido pode ter 1 pagamento; suporta Pix/cartão/boleto)
CREATE TABLE IF NOT EXISTS public.payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'pagarme',
  external_id TEXT,
  method TEXT CHECK (method IN ('pix', 'credit_card', 'boleto')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'paid', 'failed', 'refunded', 'cancelled')),
  amount NUMERIC(10,2) NOT NULL,
  pix_qr_code TEXT,
  pix_qr_code_url TEXT,
  pix_expires_at TIMESTAMPTZ,
  raw_payload JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_payments_order_id ON public.payments(order_id);
CREATE INDEX IF NOT EXISTS idx_payments_external_id ON public.payments(external_id);

CREATE TRIGGER trg_payments_updated_at
  BEFORE UPDATE ON public.payments
  FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();

ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;

-- Comprador vê o pagamento do próprio pedido
CREATE POLICY "payments_select_own"
  ON public.payments FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.orders WHERE id = order_id AND buyer_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin')
  );

-- Nenhuma policy de INSERT/UPDATE para usuários — só service_role (webhook/server action) grava
