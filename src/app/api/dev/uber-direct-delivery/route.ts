import { NextRequest, NextResponse } from "next/server";
import {
  createDelivery,
  getDeliveryQuote,
  UberDirectError,
  type DeliveryContactInfo,
  type DeliveryManifestItem,
  type UberDirectAddress,
} from "@/lib/uber-direct";

/**
 * Rota SO para teste manual (Postman/curl) do fluxo completo cotacao ->
 * criacao de entrega na Uber Direct em SANDBOX. Mesmo proposito e mesmo guard
 * de producao da rota de cotacao (/api/dev/uber-direct-quote): nao e usada pelo
 * checkout e nao e linkada de nenhuma pagina.
 *
 * Existe por um motivo especifico: a referencia oficial do endpoint de criacao
 * de entrega nao estava acessivel quando createDelivery() foi escrito, entao os
 * nomes de campo do REQUEST vieram de conhecimento geral da API + consistencia
 * com o quote. Esta rota devolve a resposta CRUA da Uber justamente pra
 * conferir, contra a API real, se os campos batem.
 *
 * Todos os valores tem default de teste em Teresina; qualquer um pode ser
 * sobrescrito pelo body. POST sem body nenhum ja roda o fluxo inteiro.
 */

// Enderecos de teste ja usados na validacao da cotacao. Os CEPs sao os da via,
// nao de um numero especifico — sobrescreva pelo body se precisar de precisao.
const DEFAULT_PICKUP: UberDirectAddress = {
  street_address: ["Av. Frei Serafim, 2000"],
  city: "Teresina",
  state: "PI",
  zip_code: "64001-020",
  country: "BR",
};

const DEFAULT_DROPOFF: UberDirectAddress = {
  street_address: ["Av. Raul Lopes, 1000"],
  city: "Teresina",
  state: "PI",
  zip_code: "64046-100",
  country: "BR",
};

const DEFAULT_CONTACT: DeliveryContactInfo = {
  pickupName: "Loja Teste",
  pickupPhone: "+5586999999999",
  dropoffName: "Teste",
  dropoffPhone: "+5586988888888",
  dropoffNotes: "Entrega de teste — sandbox",
};

const DEFAULT_ITEMS: DeliveryManifestItem[] = [
  { name: "Vaso de ceramica artesanal", quantity: 1, priceCents: 9900 },
];

interface TestBody {
  pickup_address?: UberDirectAddress;
  dropoff_address?: UberDirectAddress;
  contact?: Partial<DeliveryContactInfo>;
  manifest_items?: DeliveryManifestItem[];
  external_id?: string;
  /** Valor declarado da carga em centavos — vai como manifest_total_value. */
  manifest_total_value_cents?: number;
}

export async function POST(request: NextRequest) {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Body e opcional: sem ele, roda com os defaults de Teresina.
  let body: TestBody = {};
  try {
    const text = await request.text();
    if (text.trim().length > 0) body = JSON.parse(text);
  } catch {
    return NextResponse.json({ error: "Body invalido — envie JSON ou nada." }, { status: 400 });
  }

  const pickupAddress = body.pickup_address ?? DEFAULT_PICKUP;
  const dropoffAddress = body.dropoff_address ?? DEFAULT_DROPOFF;
  const contact: DeliveryContactInfo = { ...DEFAULT_CONTACT, ...body.contact };
  const manifestItems = body.manifest_items ?? DEFAULT_ITEMS;

  try {
    // a) cotacao
    const quote = await getDeliveryQuote(pickupAddress, dropoffAddress);

    // b) quote_id — sem ele nao da pra criar a entrega, e o proprio fato de
    // faltar ja e um resultado util do teste.
    if (!quote.id) {
      return NextResponse.json(
        {
          step: "quote",
          error: "A cotacao voltou sem quote_id — createDelivery() nao pode ser testado.",
          quote_raw: quote.raw,
        },
        { status: 502 },
      );
    }

    // c) criacao imediata, com o quote_id recem-obtido (a cotacao expira rapido)
    const delivery = await createDelivery(
      quote.id,
      pickupAddress,
      dropoffAddress,
      contact,
      manifestItems,
      body.external_id,
      body.manifest_total_value_cents,
    );

    // d) resposta CRUA dos dois passos, sem transformar nem resumir — o ponto
    // do teste e ver exatamente os nomes de campo que a Uber devolve.
    return NextResponse.json({
      sent: {
        pickup_address: pickupAddress,
        dropoff_address: dropoffAddress,
        contact,
        manifest_items: manifestItems,
        external_id: body.external_id ?? null,
        manifest_total_value_cents: body.manifest_total_value_cents ?? null,
        quote_id: quote.id,
      },
      quote_raw: quote.raw,
      delivery_raw: delivery.raw,
    });
  } catch (err) {
    if (err instanceof UberDirectError) {
      console.error("[uber-direct][dev] falha no fluxo de criacao de entrega:", err.message);
      return NextResponse.json({ error: err.message, status: err.status ?? null }, { status: err.status ?? 502 });
    }
    console.error("[uber-direct][dev] erro inesperado:", err);
    return NextResponse.json({ error: "Erro inesperado ao criar entrega de teste." }, { status: 500 });
  }
}
