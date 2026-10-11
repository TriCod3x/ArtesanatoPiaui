import { test } from "node:test";
import assert from "node:assert/strict";
import {
  parseMentions,
  applyMentions,
  mentionKey,
  mentionsToPlainText,
  findMentionQuery,
  checkPostTextLength,
  MAX_MENTIONS,
} from "./mentions";

// Rodar: ver scripts/test-community-pack.sh (compila com tsc e roda node --test).
const U1 = "11111111-1111-4111-8111-111111111111";
const U2 = "22222222-2222-4222-8222-222222222222";
const S1 = "33333333-3333-4333-8333-333333333333";
const ids = (n: number) =>
  Array.from({ length: n }, (_, i) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(i).padStart(12, "0")}`);

test("token válido de usuário e de loja", () => {
  const p = parseMentions(`oi @[Maria](user:${U1}) e @[Ateliê](store:${S1})!`);
  assert.equal(p.malformed.length, 0);
  assert.deepEqual(
    p.tokens.map((t) => [t.kind, t.id, t.name]),
    [["user", U1, "Maria"], ["store", S1, "Ateliê"]],
  );
});

test("id malformado é apontado e rejeita o post", () => {
  const content = "oi @[Maria](user:123)";
  const p = parseMentions(content);
  assert.equal(p.tokens.length, 0);
  assert.equal(p.malformed.length, 1);
  const r = applyMentions(content, p, new Map());
  assert.equal(r.ok, false);
});

test("mais de 5 menções distintas é rejeitado; exatamente 5 passa", () => {
  const six = ids(MAX_MENTIONS + 1);
  const textSix = six.map((id, i) => `@[N${i}](user:${id})`).join(" ");
  const pSix = parseMentions(textSix);
  const found = new Map(six.map((id, i) => [mentionKey("user", id), `N${i}`]));
  assert.equal(applyMentions(textSix, pSix, found).ok, false);

  const five = six.slice(0, 5);
  const textFive = five.map((id, i) => `@[N${i}](user:${id})`).join(" ");
  assert.equal(applyMentions(textFive, parseMentions(textFive), found).ok, true);
});

test("token duplicado conta uma vez e gera uma menção só", () => {
  const content = `@[Maria](user:${U1}) e de novo @[Maria](user:${U1})`;
  const r = applyMentions(content, parseMentions(content), new Map([[mentionKey("user", U1), "Maria"]]));
  assert.equal(r.ok, true);
  if (r.ok) assert.equal(r.mentions.length, 1);
});

test('"@texto" solto não é menção', () => {
  const p = parseMentions("fala @maria e @[sem-tipo](abc) @loja");
  assert.equal(p.tokens.length, 0);
  assert.equal(p.malformed.length, 0);
  const r = applyMentions("fala @maria", p, new Map());
  assert.ok(r.ok && r.mentions.length === 0 && r.content === "fala @maria");
});

test("nome de exibição forjado é reescrito com o do banco", () => {
  const content = `oi @[Administrador Oficial](user:${U1}), veja @[Loja Falsa](store:${S1})`;
  const found = new Map([
    [mentionKey("user", U1), "Maria Souza"],
    [mentionKey("store", S1), "Ateliê do Rio"],
  ]);
  const r = applyMentions(content, parseMentions(content), found);
  assert.ok(r.ok);
  if (r.ok) {
    assert.equal(
      r.content,
      `oi @[Maria Souza](user:${U1}), veja @[Ateliê do Rio](store:${S1})`,
    );
    assert.ok(!r.content.includes("Administrador"));
  }
});

test("nome do banco com colchetes/parênteses não quebra o token", () => {
  const content = `@[x](store:${S1})`;
  const r = applyMentions(content, parseMentions(content), new Map([[mentionKey("store", S1), "Ateliê (Teresina) [Piauí]"]]));
  assert.ok(r.ok);
  if (r.ok) {
    const again = parseMentions(r.content);
    assert.equal(again.tokens.length, 1);
    assert.equal(again.malformed.length, 0);
  }
});

test("id inexistente (não encontrado no banco) rejeita", () => {
  const content = `@[Fantasma](user:${U2})`;
  assert.equal(applyMentions(content, parseMentions(content), new Map()).ok, false);
});

test("texto visível: token vira @Nome; limites de tamanho medem o visível", () => {
  const content = `oi @[Maria](user:${U1})`;
  assert.equal(mentionsToPlainText(content), "oi @Maria");
  assert.equal(checkPostTextLength(content), null);
  assert.ok(checkPostTextLength("oi") !== null);
});

test("autocomplete: detecta @consulta no cursor", () => {
  assert.deepEqual(findMentionQuery("oi @ma", 6), { start: 3, query: "ma" });
  assert.equal(findMentionQuery("email@dominio", 13), null);
  assert.equal(findMentionQuery("oi @ma ri", 9), null);
});
