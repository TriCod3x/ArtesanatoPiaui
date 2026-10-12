import { test } from "node:test";
import assert from "node:assert/strict";
import { findStoresWithoutPayments, storeWithoutPaymentsMessage, STORE_WITHOUT_PAYMENTS_LABEL } from "./store-payments";
import { buildOnboardingChecklist, isOnboardingComplete } from "./seller-onboarding";

// Rodar: bash scripts/test-store-payments.sh

test("todas as lojas conectadas: nenhuma bloqueada", () => {
  assert.deepEqual(findStoresWithoutPayments(["a", "b"], ["a", "b"]), []);
});

test("loja sem credencial é bloqueada, as conectadas passam", () => {
  assert.deepEqual(findStoresWithoutPayments(["a", "b", "c"], new Set(["b"])), ["a", "c"]);
});

test("nenhuma conectada: todas bloqueadas, sem repetir loja", () => {
  assert.deepEqual(findStoresWithoutPayments(["a", "a", "b"], []), ["a", "b"]);
});

test("carrinho sem lojas não bloqueia nada", () => {
  assert.deepEqual(findStoresWithoutPayments([], ["a"]), []);
});

test("mensagem cita a loja (singular) e as lojas (plural)", () => {
  assert.match(storeWithoutPaymentsMessage(["Cestas do Sul"]), /Cestas do Sul/);
  assert.ok(storeWithoutPaymentsMessage(["Cestas do Sul"]).startsWith(STORE_WITHOUT_PAYMENTS_LABEL));
  const plural = storeWithoutPaymentsMessage(["A", "B"]);
  assert.match(plural, /"A", "B"/);
  assert.match(plural, /Estas lojas/);
});

test("checklist: loja nova tem 3 passos pendentes, na ordem MP, ME, produto", () => {
  const steps = buildOnboardingChecklist({ mercadoPagoConnected: false, melhorEnvioConnected: false, hasProducts: false });
  assert.deepEqual(steps.map((s) => s.key), ["mercadopago", "melhorenvio", "product"]);
  assert.deepEqual(steps.map((s) => s.done), [false, false, false]);
  assert.deepEqual(steps.map((s) => s.href), ["/minha-loja/pagamentos", "/minha-loja/frete", "/meus-produtos/novo"]);
  assert.equal(isOnboardingComplete(steps), false);
});

test("checklist: cada passo reflete só o seu estado", () => {
  const steps = buildOnboardingChecklist({ mercadoPagoConnected: true, melhorEnvioConnected: false, hasProducts: true });
  assert.deepEqual(steps.map((s) => s.done), [true, false, true]);
  assert.equal(isOnboardingComplete(steps), false);
});

test("checklist: completo quando os 3 estão feitos (bloco some)", () => {
  const steps = buildOnboardingChecklist({ mercadoPagoConnected: true, melhorEnvioConnected: true, hasProducts: true });
  assert.equal(isOnboardingComplete(steps), true);
});
