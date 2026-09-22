import { NextRequest, NextResponse } from "next/server";
import { getDeliveryQuote, UberDirectError, type UberDirectAddress } from "@/lib/uber-direct";

/**
 * Rota SÓ para teste manual (Postman/curl) da cotação Uber Direct em
 * sandbox. Não é usada pelo checkout real e não é linkada de nenhuma página.
 *
 * Body esperado:
 * {
 *   "pickup_address": { "street_address": ["Rua X, 123"], "city": "Teresina", "state": "PI", "zip_code": "64000-000", "country": "BR" },
 *   "dropoff_address": { "street_address": ["Rua Y, 456"], "city": "Teresina", "state": "PI", "zip_code": "64000-000", "country": "BR" }
 * }
 */
function isValidAddress(value: unknown): value is UberDirectAddress {
  if (!value || typeof value !== "object") return false;
  const addr = value as Record<string, unknown>;
  return (
    Array.isArray(addr.street_address) &&
    addr.street_address.every((line) => typeof line === "string") &&
    typeof addr.city === "string" &&
    typeof addr.state === "string" &&
    typeof addr.zip_code === "string" &&
    typeof addr.country === "string"
  );
}

export async function POST(request: NextRequest) {
  let body: { pickup_address?: unknown; dropoff_address?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Body inválido — envie JSON." }, { status: 400 });
  }

  const { pickup_address, dropoff_address } = body;
  if (!isValidAddress(pickup_address) || !isValidAddress(dropoff_address)) {
    return NextResponse.json(
      {
        error:
          "pickup_address e dropoff_address são obrigatórios e devem conter: street_address (array de strings), city, state, zip_code, country.",
      },
      { status: 400 },
    );
  }

  try {
    const quote = await getDeliveryQuote(pickup_address, dropoff_address);
    return NextResponse.json({
      fee: quote.fee,
      currency: quote.currency,
      dropoff_eta: quote.dropoffEta,
    });
  } catch (err) {
    if (err instanceof UberDirectError) {
      console.error("[uber-direct] falha ao cotar:", err.message);
      return NextResponse.json({ error: err.message }, { status: err.status ?? 502 });
    }
    console.error("[uber-direct] erro inesperado:", err);
    return NextResponse.json({ error: "Erro inesperado ao cotar entrega." }, { status: 500 });
  }
}
