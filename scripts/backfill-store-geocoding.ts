/**
 * Backfill de geocodificação pra lojas criadas antes de geocodeStore() existir
 * (ver src/actions/stores.ts). Sem coordenadas, uma loja nunca é elegível à
 * entrega expressa (ver isWithinExpressRadius em src/actions/shipping.ts).
 *
 * Reaproveita geocodeAddress() — a mesma função chamada na criação/edição de
 * loja — pra não duplicar a lógica de montagem da query nem o rate limit do
 * Nominatim (1 req/s, já serializado dentro de geocodeAddress).
 *
 * Uso:
 *   npx tsx scripts/backfill-store-geocoding.ts --dry-run   (só lista, não grava)
 *   npx tsx scripts/backfill-store-geocoding.ts             (geocodifica e grava)
 *
 * Só processa lojas com latitude nula — rodar de novo não muda nada pra quem
 * já foi geocodificado (idempotente). Lê a service role key de .env.local.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { geocodeAddress } from "../src/lib/geocoding";
import type { Database } from "../src/types/database";

function loadEnvLocal(): void {
  const envPath = resolve(process.cwd(), ".env.local");
  if (!existsSync(envPath)) return;

  for (const rawLine of readFileSync(envPath, "utf8").split("\n")) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;

    const eq = line.indexOf("=");
    if (eq === -1) continue;

    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

loadEnvLocal();

const DRY_RUN = process.argv.includes("--dry-run");

async function main() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    console.error("NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY não configuradas em .env.local.");
    process.exitCode = 1;
    return;
  }

  const admin = createClient<Database>(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: stores, error } = await admin
    .from("stores")
    .select("id, name, cep, address_street, address_number, address_neighborhood, city, state")
    .is("latitude", null);

  if (error) {
    console.error("Erro ao buscar lojas sem coordenadas:", error.message);
    process.exitCode = 1;
    return;
  }

  if (!stores || stores.length === 0) {
    console.log("Nenhuma loja com latitude nula. Nada a fazer.");
    return;
  }

  console.log(
    `${stores.length} loja(s) sem coordenadas` + (DRY_RUN ? " — modo --dry-run, nada será escrito." : "."),
  );

  for (const store of stores) {
    const address = {
      street: store.address_street,
      number: store.address_number,
      neighborhood: store.address_neighborhood,
      city: store.city,
      state: store.state,
      cep: store.cep,
    };

    const queryPreview = [
      [address.street, address.number].filter(Boolean).join(", "),
      address.neighborhood,
      address.city,
      address.state,
      address.cep,
      "Brasil",
    ]
      .filter((part) => typeof part === "string" && part.trim().length > 0)
      .join(", ");

    console.log(`\n— ${store.name} (${store.id})`);
    console.log(`  endereço enviado ao Nominatim: ${queryPreview || "(vazio — geocodeAddress vai devolver null)"}`);

    if (DRY_RUN) continue;

    try {
      const coordinates = await geocodeAddress(address);
      if (!coordinates) {
        console.log("  não resolveu — Nominatim não encontrou o endereço, ou faltam city/cep (mínimo exigido).");
        continue;
      }

      console.log(`  coordenadas: ${coordinates.latitude}, ${coordinates.longitude}`);
      console.log(`  display_name (Nominatim): ${coordinates.displayName ?? "(não veio na resposta)"}`);

      const { error: updateError } = await admin
        .from("stores")
        .update({
          latitude: coordinates.latitude,
          longitude: coordinates.longitude,
          geocoded_at: new Date().toISOString(),
        })
        .eq("id", store.id);

      if (updateError) {
        console.log(`  falhou ao gravar no banco: ${updateError.message}`);
      } else {
        console.log("  gravado.");
      }
    } catch (err) {
      // Uma loja com endereço estranho não pode abortar o lote inteiro.
      console.log(`  erro inesperado, seguindo pra próxima: ${err instanceof Error ? err.message : String(err)}`);
    }
  }
}

main();
