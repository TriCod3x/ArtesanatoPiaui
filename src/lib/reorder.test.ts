import { test } from "node:test";
import assert from "node:assert/strict";
import { computeReorder, type ReorderProduct } from "./reorder";

// Rodar: ver scripts/test-community-pack.sh (compila com tsc e roda node --test).
const prod = (over: Partial<ReorderProduct> = {}): ReorderProduct => ({
  id: "p1",
  name: "Cesta de capim dourado",
  price: 100,
  stock: 10,
  status: "active",
  storeStatus: "active",
  ...over,
});
const run = (p: ReorderProduct, quantity = 2) =>
  computeReorder([{ product_id: p.id, quantity }], new Map([[p.id, p]]));

test("produto ativo, loja ativa, com estoque: disponível", () => {
  const r = run(prod());
  assert.equal(r.unavailable.length, 0);
  assert.deepEqual(
    r.available.map((a) => [a.productId, a.quantity]),
    [["p1", 2]],
  );
});

test("produto inativo fica de fora", () => {
  const r = run(prod({ status: "inactive" }));
  assert.equal(r.available.length, 0);
  assert.equal(r.unavailable[0].reason, "produto_inativo");
  assert.equal(r.unavailable[0].name, "Cesta de capim dourado");
});

test("loja inativa fica de fora", () => {
  const r = run(prod({ storeStatus: "suspended" }));
  assert.equal(r.available.length, 0);
  assert.equal(r.unavailable[0].reason, "loja_inativa");
});

test("estoque 0 fica de fora", () => {
  const r = run(prod({ stock: 0 }));
  assert.equal(r.available.length, 0);
  assert.equal(r.unavailable[0].reason, "sem_estoque");
});

test("quantidade acima do estoque é limitada ao estoque", () => {
  const r = run(prod({ stock: 3 }), 8);
  assert.equal(r.available[0].quantity, 3);
  assert.equal(r.available[0].requestedQuantity, 8);
});

test("o preço atual do produto prevalece sobre o do pedido antigo", () => {
  const items = [{ product_id: "p1", quantity: 1, unit_price: 50 }];
  const r = computeReorder(items, new Map([["p1", prod({ price: 120 })]]));
  assert.equal(r.available[0].unitPrice, 120);
});

test("produto apagado/inexistente e linhas repetidas", () => {
  const r = computeReorder(
    [
      { product_id: "p1", quantity: 2 },
      { product_id: "p1", quantity: 3 },
      { product_id: "sumiu", quantity: 1 },
      { product_id: null, quantity: 1 },
    ],
    new Map([["p1", prod()]]),
  );
  assert.deepEqual(
    r.available.map((a) => a.quantity),
    [5],
  );
  assert.equal(r.unavailable.length, 2);
});
