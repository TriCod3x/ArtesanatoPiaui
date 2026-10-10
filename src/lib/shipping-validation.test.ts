import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validateShipping,
  validateShippingSelection,
  type ClientShippingSelection,
  type QuotedShippingOption,
  type ServerStoreQuote,
} from "./shipping-validation";
import { isExpressAvailableNow } from "./store-hours";

// Rodar: bash scripts/test-shipping-validation.sh (tsc + node --test).
// Cotações simuladas: nada aqui toca banco, Uber ou Melhor Envio.

const A = "store-a";
const B = "store-b";

const sedex = (storeId: string, price = 25): QuotedShippingOption => ({
  storeId,
  carrier: "melhorenvio",
  serviceId: "2",
  serviceName: "SEDEX",
  price,
  deliveryTimeDays: 3,
});

const express = (storeId: string, price = 12): QuotedShippingOption => ({
  storeId,
  carrier: "uber_direct",
  serviceId: "uber-direct",
  serviceName: "Entrega expressa",
  price,
  deliveryTimeDays: 0,
});

const pick = (o: QuotedShippingOption, shownPrice = o.price): ClientShippingSelection => ({
  storeId: o.storeId,
  carrier: o.carrier,
  serviceId: o.serviceId,
  price: shownPrice,
});

const quote = (storeId: string, options: QuotedShippingOption[], failed?: ServerStoreQuote["failedCarriers"]) =>
  ({ storeId, options, ...(failed ? { failedCarriers: failed } : {}) }) satisfies ServerStoreQuote;

test("caminho feliz: grava preço/prazo/nome da cotação do servidor", () => {
  const r = validateShipping([A], [pick(sedex(A))], [quote(A, [sedex(A), express(A)])]);
  assert.equal(r.ok, true);
  if (r.ok) {
    assert.equal(r.shipments.length, 1);
    assert.deepEqual(r.shipments[0], {
      storeId: A,
      carrier: "melhorenvio",
      serviceId: "2",
      serviceName: "SEDEX",
      price: 25,
      deliveryTimeDays: 3,
    });
  }
});

test("preço 0 do cliente é rejeitado", () => {
  const r = validateShipping([A], [pick(sedex(A), 0)], [quote(A, [sedex(A)])]);
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.code, "invalid_selection");
});

test("preço negativo do cliente é rejeitado", () => {
  const r = validateShipping([A], [pick(sedex(A), -5)], [quote(A, [sedex(A)])]);
  assert.equal(!r.ok && r.code, "invalid_selection");
});

test("preço NaN do cliente é rejeitado", () => {
  const r = validateShipping([A], [pick(sedex(A), Number.NaN)], [quote(A, [sedex(A)])]);
  assert.equal(!r.ok && r.code, "invalid_selection");
});

test("preço <= 0 vindo da cotação do servidor também é rejeitado", () => {
  const free = sedex(A, 0);
  const r = validateShipping([A], [pick(free, 10)], [quote(A, [free])]);
  assert.equal(r.ok, false);
});

test("loja fora do carrinho é rejeitada", () => {
  const r = validateShipping([A], [pick(sedex(A)), pick(sedex(B))], [quote(A, [sedex(A)])]);
  assert.equal(!r.ok && r.code, "invalid_selection");
});

test("loja duplicada é rejeitada", () => {
  const r = validateShipping([A], [pick(sedex(A)), pick(express(A))], [quote(A, [sedex(A), express(A)])]);
  assert.equal(!r.ok && r.code, "invalid_selection");
});

test("loja do carrinho sem frete é rejeitada", () => {
  const r = validateShipping([A, B], [pick(sedex(A))], [quote(A, [sedex(A)]), quote(B, [sedex(B)])]);
  assert.equal(!r.ok && r.code, "invalid_selection");
});

test("carrier inventado é rejeitado", () => {
  const r = validateShippingSelection([A], [{ storeId: A, carrier: "sedex_do_cliente", serviceId: "2", price: 10 }]);
  assert.equal(r.ok, false);
});

test("serviceId que não está na cotação do servidor", () => {
  const fake: ClientShippingSelection = { storeId: A, carrier: "melhorenvio", serviceId: "999", price: 10 };
  const r = validateShipping([A], [fake], [quote(A, [sedex(A)])]);
  assert.equal(!r.ok && r.code, "option_unavailable");
  assert.deepEqual(!r.ok && "storeIds" in r && r.storeIds, [A]);
});

test("expressa de loja fechada: a cotação nova não a oferece -> recusada", () => {
  // Mesma regra que o servidor usa pra montar a cotação: loja fechada => sem expressa.
  const closed = isExpressAvailableNow({
    hours: [{ weekday: 1, opens: "08:00", closes: "18:00" }], // só abre segunda
    paused: false,
    prepMinutes: 30,
    now: new Date("2026-10-10T15:00:00Z"), // sábado 12:00 em Fortaleza
  });
  assert.equal(closed.available, false);

  const serverOptions = closed.available ? [sedex(A), express(A)] : [sedex(A)];
  const r = validateShipping([A], [pick(express(A))], [quote(A, serverOptions)]);
  assert.equal(!r.ok && r.code, "option_unavailable");
});

test("frete do servidor maior que o do cliente além de R$ 2,00: erro", () => {
  // cliente viu 20,00; servidor agora cobra 22,01
  const r = validateShipping([A], [pick(sedex(A, 22.01), 20)], [quote(A, [sedex(A, 22.01)])]);
  assert.equal(r.ok, false);
  assert.equal(!r.ok && r.code, "price_changed");
  assert.equal(!r.ok && r.message, "O frete mudou, confirme de novo.");
});

test("aumento de exatamente R$ 2,00 é aceito (limite)", () => {
  const r = validateShipping([A], [pick(sedex(A, 22), 20)], [quote(A, [sedex(A, 22)])]);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.shipments[0].price, 22);
});

test("frete do servidor menor que o do cliente: aceita e cobra o do servidor", () => {
  const r = validateShipping([A], [pick(sedex(A, 18), 25)], [quote(A, [sedex(A, 18)])]);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.shipments[0].price, 18);
});

test("aumento pequeno (<= R$ 2,00): cobra o do servidor, não o do cliente", () => {
  const r = validateShipping([A], [pick(sedex(A, 21.5), 20)], [quote(A, [sedex(A, 21.5)])]);
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.shipments[0].price, 21.5);
});

test("cotação do servidor indisponível (null): nunca usa o valor do cliente", () => {
  const r = validateShipping([A], [pick(sedex(A, 1), 1)], null);
  assert.equal(!r.ok && r.code, "quote_unavailable");
});

test("API da transportadora caiu e a opção sumiu: indisponível, não 'mudou'", () => {
  const r = validateShipping([A], [pick(express(A))], [quote(A, [sedex(A)], ["uber_direct"])]);
  assert.equal(!r.ok && r.code, "quote_unavailable");
});

test("loja sem cotação nenhuma: indisponível", () => {
  const r = validateShipping([A, B], [pick(sedex(A)), pick(sedex(B))], [quote(A, [sedex(A)])]);
  assert.equal(!r.ok && r.code, "quote_unavailable");
});

test("duas lojas, uma ok e uma com preço subido: erro aponta só a loja alterada", () => {
  const r = validateShipping(
    [A, B],
    [pick(sedex(A)), pick(sedex(B, 40), 30)],
    [quote(A, [sedex(A)]), quote(B, [sedex(B, 40)])],
  );
  assert.equal(!r.ok && r.code, "price_changed");
  assert.deepEqual(!r.ok && "storeIds" in r && r.storeIds, [B]);
});
