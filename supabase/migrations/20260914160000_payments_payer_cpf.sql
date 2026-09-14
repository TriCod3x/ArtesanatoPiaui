-- CPF do comprador, exigido pela Mercado Pago em payer.identification pra
-- pagamentos Pix no Brasil. Não existe em lugar nenhum hoje pro comprador
-- (profiles não tem CPF — só seller_verifications, que é exclusivo de
-- vendedor), então fica direto em payments (nullable: cartão não precisa).
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS payer_cpf text;
