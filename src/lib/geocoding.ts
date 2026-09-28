// Geocodificação de endereços via Nominatim (OpenStreetMap) — serviço público
// e gratuito, usado pra descobrir as coordenadas da loja e do endereço de
// entrega e decidir se a entrega expressa (Uber Direct) é elegível.
//
// Política de uso do Nominatim (https://operations.osmfoundation.org/policies/nominatim/):
// no máximo 1 requisição por segundo e User-Agent identificando a aplicação.
// Quem não respeita leva bloqueio de IP. Por isso toda chamada aqui passa por
// uma fila serializada (ver enqueue()).

const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";
const MIN_INTERVAL_MS = 1_000;
const REQUEST_TIMEOUT_MS = 8_000;

export interface Coordinates {
  latitude: number;
  longitude: number;
}

export interface GeocodeAddressInput {
  street?: string | null;
  number?: string | null;
  neighborhood?: string | null;
  city?: string | null;
  state?: string | null;
  cep?: string | null;
}

function userAgent(): string {
  // O Nominatim exige um User-Agent identificável, com forma de contato. Usa a
  // URL da aplicação, que é o contato público que temos.
  const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? "https://artesanatospiaui.com.br";
  return `ArtesanatosPiaui/1.0 (${appUrl})`;
}

// Fila serializada: cada chamada espera a anterior terminar E o intervalo
// mínimo desde a última requisição. É best-effort — em serverless cada
// instância tem a sua fila, então o teto de 1 req/s vale por instância, não
// globalmente. Como as chamadas aqui são esparsas (criação/edição de loja e
// cálculo de frete), isso é suficiente; se um dia virar volume, precisa de um
// limitador compartilhado (Redis) ou de um provedor pago.
let chain: Promise<unknown> = Promise.resolve();
let lastRequestAt = 0;

function enqueue<T>(task: () => Promise<T>): Promise<T> {
  const run = chain.then(async () => {
    const waitMs = lastRequestAt + MIN_INTERVAL_MS - Date.now();
    if (waitMs > 0) await new Promise((resolve) => setTimeout(resolve, waitMs));
    lastRequestAt = Date.now();
    return task();
  });
  // A fila não pode quebrar por causa de uma falha individual.
  chain = run.catch(() => undefined);
  return run;
}

/** Monta a string de busca a partir das partes que existirem. */
function buildQuery(address: GeocodeAddressInput): string | null {
  const streetLine = [address.street, address.number].filter(Boolean).join(", ");
  const parts = [streetLine, address.neighborhood, address.city, address.state, address.cep, "Brasil"]
    .map((part) => (typeof part === "string" ? part.trim() : ""))
    .filter((part) => part.length > 0);

  // Sem cidade nem CEP o resultado seria um chute — melhor não geocodificar.
  if (!address.city && !address.cep) return null;
  return parts.join(", ");
}

interface NominatimResult {
  lat?: string;
  lon?: string;
}

/**
 * Resolve um endereço em coordenadas. Devolve null — em vez de lançar — quando
 * o endereço não resolve, o serviço falha ou o formato da resposta é
 * inesperado: geocodificação é best-effort e nunca deve derrubar o fluxo que a
 * chamou (criação de loja, cálculo de frete).
 */
export async function geocodeAddress(address: GeocodeAddressInput): Promise<Coordinates | null> {
  const query = buildQuery(address);
  if (!query) return null;

  const url = new URL(NOMINATIM_URL);
  url.searchParams.set("q", query);
  url.searchParams.set("format", "jsonv2");
  url.searchParams.set("limit", "1");
  url.searchParams.set("countrycodes", "br");
  url.searchParams.set("addressdetails", "0");

  try {
    return await enqueue(async () => {
      const res = await fetch(url, {
        headers: {
          "User-Agent": userAgent(),
          "Accept-Language": "pt-BR",
          Accept: "application/json",
        },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });

      if (!res.ok) {
        console.error(`[geocoding] Nominatim respondeu ${res.status} para "${query}"`);
        return null;
      }

      const results = (await res.json()) as NominatimResult[];
      const first = Array.isArray(results) ? results[0] : undefined;
      if (!first?.lat || !first?.lon) return null;

      const latitude = Number(first.lat);
      const longitude = Number(first.lon);
      if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;

      return { latitude, longitude };
    });
  } catch (err) {
    console.error(`[geocoding] falha ao geocodificar "${query}":`, err);
    return null;
  }
}

const EARTH_RADIUS_KM = 6371;

function toRadians(degrees: number): number {
  return (degrees * Math.PI) / 180;
}

/**
 * Distância em linha reta (haversine) entre duas coordenadas, em km.
 *
 * É distância geodésica, não de rota: a distância rodoviária real é sempre
 * maior. Serve como filtro barato antes de pedir cotação à Uber Direct — quem
 * dá a palavra final sobre cobertura é a própria Uber, no getDeliveryQuote().
 */
export function haversineDistanceKm(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);

  return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
