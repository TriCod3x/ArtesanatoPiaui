"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  createRecipient,
  createOrder as createPagarmeOrder,
  getOrder as getPagarmeOrder,
  PagarmeError,
  type CreateOrderSplit,
  type PagarmeAddress,
} from "@/lib/pagarme/client";
import { settlePaidOrder, markPaymentFailed } from "@/lib/pagarme/settle";
import { bankDetailsSchema, type BankDetailsInput } from "@/lib/validations";
import {
  PIX_EXPIRES_IN_SECONDS,
  CARD_STATEMENT_DESCRIPTOR,
  MAX_INSTALLMENTS,
} from "@/lib/constants";
import { onlyDigits } from "@/lib/utils";
import type { PaymentMethod, PaymentStatus } from "@/types";

// ── helpers ────────────────────────────────────────────────────────────────

function mapChargeStatus(status: string | undefined): PaymentStatus {
  switch (status) {
    case "paid":
      return "paid";
    case "refunded":
      return "refunded";
    case "canceled":
    case "voided":
      return "cancelled";
    case "failed":
    case "payment_failed":
    case "not_authorized":
      return "failed";
    default:
      return "pending";
  }
}

function toAddress(v: {
  address_street: string;
  address_number: string;
  address_complement: string | null;
  address_neighborhood: string;
  address_city: string;
  address_state: string;
  cep: string;
}): PagarmeAddress {
  return {
    street: v.address_street,
    street_number: v.address_number,
    complementary: v.address_complement || undefined,
    neighborhood: v.address_neighborhood,
    city: v.address_city,
    state: v.address_state,
    zip_code: onlyDigits(v.cep),
  };
}

function phoneParts(phone: string | null): { ddd: string; number: string; type: string }[] | undefined {
  const digits = onlyDigits(phone ?? "").replace(/^55/, "");
  if (digits.length < 10) return undefined;
  return [{ ddd: digits.slice(0, 2), number: digits.slice(2), type: "mobile" }];
}

// ── Dados bancários + criação do recebedor ─────────────────────────────────

/**
 * Salva os dados bancários do vendedor em `seller_verifications` e cria o
 * recebedor (recipient) na Pagar.me. Só funciona se a loja já estiver `active`.
 */
export async function saveBankDetails(data: BankDetailsInput) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Você precisa estar logado." };

  const parsed = bankDetailsSchema.safeParse(data);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Dados inválidos." };
  }
  const values = parsed.data;

  const { data: store } = await supabase
    .from("stores")
    .select("id, status, pagarme_recipient_id")
    .eq("owner_id", user.id)
    .maybeSingle();

  if (!store) return { error: "Você ainda não tem uma loja." };
  if (store.status !== "active") {
    return { error: "Sua loja precisa estar aprovada para cadastrar recebimento." };
  }

  // Usa a service role: atualizar seller_verifications como o próprio usuário
  // dispararia o trigger que reseta o status de verificação para 'pending'.
  const admin = createAdminClient();

  const { error: saveError } = await admin
    .from("seller_verifications")
    .update({
      bank_code: values.bank_code,
      bank_agency: values.bank_agency,
      bank_account: values.bank_account,
      bank_account_digit: values.bank_account_digit,
      bank_account_type: values.bank_account_type,
    })
    .eq("user_id", user.id);

  if (saveError) {
    return { error: "Erro ao salvar os dados bancários." };
  }

  const recipient = await createPagarmeRecipientForUser(user.id);
  revalidatePath("/minha-loja/pagamentos");
  revalidatePath("/dashboard");

  if ("error" in recipient) {
    return {
      success: true,
      warning: `Dados salvos, mas o recebedor não pôde ser criado: ${recipient.error}`,
    };
  }

  return { success: true, recipientId: recipient.recipientId };
}

/**
 * Monta o payload (CPF/CNPJ + endereço + dados bancários), cria o recebedor
 * via API e grava `pagarme_recipient_id` em `stores` e `seller_verifications`.
 * Idempotente: se já existir um recipient, retorna o id existente.
 *
 * NÃO exportar: seria um endpoint chamável sem checagem de permissão. Só é
 * chamada por `saveBankDetails`, que já autentica o vendedor dono da loja.
 */
async function createPagarmeRecipientForUser(
  userId: string,
): Promise<{ recipientId: string } | { error: string }> {
  const admin = createAdminClient();

  const [{ data: profile }, { data: verification }, { data: store }] =
    await Promise.all([
      admin.from("profiles").select("full_name, phone").eq("id", userId).maybeSingle(),
      admin
        .from("seller_verifications")
        .select(
          "cpf, cnpj, cep, address_street, address_number, address_complement, address_neighborhood, address_city, address_state, bank_code, bank_agency, bank_account, bank_account_digit, bank_account_type, pagarme_recipient_id",
        )
        .eq("user_id", userId)
        .maybeSingle(),
      admin
        .from("stores")
        .select("id, name, pagarme_recipient_id")
        .eq("owner_id", userId)
        .maybeSingle(),
    ]);

  if (!verification || !store) return { error: "Cadastro incompleto." };

  if (verification.pagarme_recipient_id) {
    if (store.pagarme_recipient_id !== verification.pagarme_recipient_id) {
      await admin
        .from("stores")
        .update({ pagarme_recipient_id: verification.pagarme_recipient_id })
        .eq("id", store.id);
    }
    return { recipientId: verification.pagarme_recipient_id };
  }

  if (
    !verification.bank_code ||
    !verification.bank_agency ||
    !verification.bank_account ||
    !verification.bank_account_digit ||
    !verification.bank_account_type
  ) {
    return { error: "Dados bancários incompletos." };
  }

  const { data: userRes } = await admin.auth.admin.getUserById(userId);
  const email = userRes.user?.email ?? `${userId}@sem-email.artesanatospiaui`;

  const isCompany = !!verification.cnpj && onlyDigits(verification.cnpj).length === 14;
  const document = onlyDigits(isCompany ? verification.cnpj! : verification.cpf);
  const holderName = profile?.full_name ?? store.name;
  const address = toAddress(verification);

  try {
    const recipient = await createRecipient({
      code: `store_${store.id}`,
      register_information: isCompany
        ? {
            type: "corporation",
            document,
            email,
            company_name: store.name,
            trading_name: store.name,
            phone_numbers: phoneParts(profile?.phone ?? null),
            main_address: address,
          }
        : {
            type: "individual",
            document,
            name: holderName,
            email,
            professional_occupation: "Artesão(ã)",
            phone_numbers: phoneParts(profile?.phone ?? null),
            address,
          },
      default_bank_account: {
        holder_name: holderName,
        holder_type: isCompany ? "company" : "individual",
        holder_document: document,
        bank: verification.bank_code,
        branch_number: verification.bank_agency,
        account_number: verification.bank_account,
        account_check_digit: verification.bank_account_digit,
        type: verification.bank_account_type as "checking" | "savings",
      },
      transfer_settings: { transfer_enabled: true, transfer_interval: "Daily", transfer_day: 0 },
      metadata: { store_id: store.id },
    });

    await Promise.all([
      admin
        .from("seller_verifications")
        .update({ pagarme_recipient_id: recipient.id })
        .eq("user_id", userId),
      admin
        .from("stores")
        .update({ pagarme_recipient_id: recipient.id })
        .eq("id", store.id),
    ]);

    return { recipientId: recipient.id };
  } catch (err) {
    const message =
      err instanceof PagarmeError
        ? err.message
        : "Falha ao comunicar com o Pagar.me.";
    return { error: message };
  }
}

// ── Pagamento do pedido ────────────────────────────────────────────────────

interface CreatePaymentInput {
  orderId: string;
  method: PaymentMethod;
  cardToken?: string;
  installments?: number;
}

export interface CreatePaymentResult {
  error?: string;
  status?: PaymentStatus;
  method?: PaymentMethod;
  pix?: {
    qr_code: string | null;
    qr_code_url: string | null;
    expires_at: string | null;
  };
}

export async function createPayment(
  input: CreatePaymentInput,
): Promise<CreatePaymentResult> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Você precisa estar logado." };

  const { orderId, method } = input;
  if (method === "credit_card" && !input.cardToken) {
    return { error: "Token do cartão ausente." };
  }

  const { data: order } = await supabase
    .from("orders")
    .select(
      "id, buyer_id, status, total_amount, items:order_items(id, quantity, unit_price, subtotal, store_id, product:products(name), store:stores(id, name, commission_rate, pagarme_recipient_id))",
    )
    .eq("id", orderId)
    .maybeSingle();

  if (!order || order.buyer_id !== user.id) {
    return { error: "Pedido não encontrado." };
  }
  if (order.status !== "pending") {
    return { error: "Este pedido não está mais aguardando pagamento." };
  }

  const items = (order.items ?? []) as unknown as {
    id: string;
    quantity: number;
    unit_price: number;
    subtotal: number;
    store_id: string;
    product: { name: string } | { name: string }[] | null;
    store:
      | { id: string; name: string; commission_rate: number; pagarme_recipient_id: string | null }
      | { id: string; name: string; commission_rate: number; pagarme_recipient_id: string | null }[]
      | null;
  }[];

  if (items.length === 0) return { error: "Pedido sem itens." };

  const admin = createAdminClient();

  // pagamento já existente e concluído?
  const { data: existingPaid } = await admin
    .from("payments")
    .select("id, status")
    .eq("order_id", orderId)
    .eq("status", "paid")
    .maybeSingle();
  if (existingPaid) return { error: "Este pedido já foi pago." };

  // ── split por loja ───────────────────────────────────────────────────────
  const byStore = new Map<
    string,
    { name: string; recipientId: string | null; commissionRate: number; subtotalCents: number }
  >();

  let totalCents = 0;
  const pagarmeItems: { amount: number; description: string; quantity: number }[] = [];

  for (const item of items) {
    const store = Array.isArray(item.store) ? item.store[0] : item.store;
    const product = Array.isArray(item.product) ? item.product[0] : item.product;
    const unitCents = Math.round(Number(item.unit_price) * 100);
    const lineCents = unitCents * item.quantity;
    totalCents += lineCents;

    pagarmeItems.push({
      amount: unitCents,
      description: product?.name ?? "Produto",
      quantity: item.quantity,
    });

    const entry = byStore.get(item.store_id) ?? {
      name: store?.name ?? "Loja",
      recipientId: store?.pagarme_recipient_id ?? null,
      commissionRate: Number(store?.commission_rate ?? 10),
      subtotalCents: 0,
    };
    entry.subtotalCents += lineCents;
    byStore.set(item.store_id, entry);
  }

  const marketplaceRecipientId = process.env.PAGARME_MARKETPLACE_RECIPIENT_ID;
  const split: CreateOrderSplit[] = [];
  let sellersCents = 0;

  for (const [storeId, s] of byStore) {
    if (!s.recipientId) {
      return {
        error: `A loja "${s.name}" ainda não configurou o recebimento e não pode receber pagamentos.`,
      };
    }
    const sellerCents = Math.round((s.subtotalCents * (100 - s.commissionRate)) / 100);
    sellersCents += sellerCents;
    split.push({
      amount: sellerCents,
      recipient_id: s.recipientId,
      type: "flat",
      options: {
        liable: false,
        charge_processing_fee: false,
        charge_remainder_fee: false,
      },
    });
    void storeId;
  }

  const platformCents = totalCents - sellersCents;
  if (platformCents > 0) {
    if (!marketplaceRecipientId) {
      return {
        error:
          "Recebedor da plataforma (PAGARME_MARKETPLACE_RECIPIENT_ID) não configurado.",
      };
    }
    split.push({
      amount: platformCents,
      recipient_id: marketplaceRecipientId,
      type: "flat",
      options: {
        liable: true,
        charge_processing_fee: true,
        charge_remainder_fee: true,
      },
    });
  } else if (marketplaceRecipientId) {
    // garante um responsável por taxas quando não há comissão
    split[0].options = {
      liable: true,
      charge_processing_fee: true,
      charge_remainder_fee: true,
    };
  }

  // ── cliente ──────────────────────────────────────────────────────────────
  const { data: profile } = await supabase
    .from("profiles")
    .select("full_name")
    .eq("id", user.id)
    .maybeSingle();

  const payment =
    method === "pix"
      ? {
          payment_method: "pix" as const,
          pix: { expires_in: PIX_EXPIRES_IN_SECONDS },
          split,
        }
      : {
          payment_method: "credit_card" as const,
          credit_card: {
            installments: Math.min(
              Math.max(1, input.installments ?? 1),
              MAX_INSTALLMENTS,
            ),
            statement_descriptor: CARD_STATEMENT_DESCRIPTOR,
            card_token: input.cardToken!,
          },
          split,
        };

  let pagarmeOrder;
  try {
    pagarmeOrder = await createPagarmeOrder({
      code: order.id,
      closed: true,
      customer: {
        name: profile?.full_name ?? "Cliente Artesanatos Piauí",
        email: user.email ?? `${user.id}@sem-email.artesanatospiaui`,
        type: "individual",
      },
      items: pagarmeItems,
      payments: [payment],
    });
  } catch (err) {
    const message =
      err instanceof PagarmeError ? err.message : "Falha ao criar o pagamento.";
    return { error: message };
  }

  const charge = pagarmeOrder.charges?.[0];
  const lastTx = charge?.last_transaction;
  const status = mapChargeStatus(charge?.status ?? pagarmeOrder.status);

  const pixInfo =
    method === "pix"
      ? {
          qr_code: lastTx?.qr_code ?? null,
          qr_code_url: lastTx?.qr_code_url ?? null,
          expires_at: lastTx?.expires_at ?? null,
        }
      : undefined;

  await admin.from("payments").upsert(
    {
      order_id: order.id,
      provider: "pagarme",
      external_id: pagarmeOrder.id,
      method,
      status,
      amount: Number(order.total_amount),
      pix_qr_code: pixInfo?.qr_code ?? null,
      pix_qr_code_url: pixInfo?.qr_code_url ?? null,
      pix_expires_at: pixInfo?.expires_at ?? null,
      raw_payload: pagarmeOrder as never,
    },
    { onConflict: "order_id" },
  );

  if (status === "paid") {
    await settlePaidOrder(order.id, pagarmeOrder);
  } else if (status === "failed") {
    await markPaymentFailed(order.id, pagarmeOrder);
  }

  revalidatePath(`/pedidos/${order.id}`);

  return { status, method, pix: pixInfo };
}

/**
 * Consulta o status do pagamento na Pagar.me e sincroniza o banco.
 * Usado pelo botão "Já paguei — verificar status" e pelas telas de pedido.
 */
export async function checkPaymentStatus(orderId: string): Promise<{
  error?: string;
  status?: PaymentStatus;
  orderStatus?: string;
}> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { error: "Você precisa estar logado." };

  const { data: order } = await supabase
    .from("orders")
    .select("id, buyer_id, status, payment:payments(external_id, status)")
    .eq("id", orderId)
    .maybeSingle();

  if (!order || order.buyer_id !== user.id) {
    return { error: "Pedido não encontrado." };
  }

  const payment = Array.isArray(order.payment) ? order.payment[0] : order.payment;
  if (!payment?.external_id) {
    return { status: (payment?.status as PaymentStatus) ?? "pending", orderStatus: order.status };
  }

  let pagarmeOrder;
  try {
    pagarmeOrder = await getPagarmeOrder(payment.external_id);
  } catch {
    return { status: payment.status as PaymentStatus, orderStatus: order.status };
  }

  const charge = pagarmeOrder.charges?.[0];
  const status = mapChargeStatus(charge?.status ?? pagarmeOrder.status);

  const admin = createAdminClient();
  if (status === "paid") {
    await settlePaidOrder(order.id, pagarmeOrder);
  } else if (status === "failed") {
    await markPaymentFailed(order.id, pagarmeOrder);
  } else {
    await admin
      .from("payments")
      .update({ status, raw_payload: pagarmeOrder as never })
      .eq("order_id", order.id)
      .neq("status", "paid");
  }

  revalidatePath(`/pedidos/${order.id}`);
  revalidatePath("/seller/pedidos");

  const { data: fresh } = await admin
    .from("orders")
    .select("status")
    .eq("id", order.id)
    .maybeSingle();

  return { status, orderStatus: fresh?.status ?? order.status };
}
