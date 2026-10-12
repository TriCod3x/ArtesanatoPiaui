import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildReportSnapshot,
  canReportAgain,
  classifyChatDbError,
  countDistinctReporters,
  isReportReason,
  isReportResolutionStatus,
  mergeMessages,
  normalizeReportDetails,
  shouldAlertAdmins,
  shouldWarnUnknownBuyer,
  splitMessageLines,
  validateMessageContent,
  type ChatMessage,
} from "./chat";

// Rodar: ver scripts/test-chat-moderation.sh (compila com tsc e roda node --test).

test("conteúdo vazio ou só espaços é recusado", () => {
  assert.equal(validateMessageContent("").ok, false);
  assert.equal(validateMessageContent("   ").ok, false);
  assert.equal(validateMessageContent("\n\t \n").ok, false);
  assert.equal(validateMessageContent(undefined).ok, false);
  assert.equal(validateMessageContent(42).ok, false);
});

test("conteúdo recebe trim e passa com 1 caractere", () => {
  assert.deepEqual(validateMessageContent("  oi  "), { ok: true, content: "oi" });
  assert.deepEqual(validateMessageContent("a"), { ok: true, content: "a" });
});

test("2000 caracteres passa, 2001 não", () => {
  assert.equal(validateMessageContent("a".repeat(2000)).ok, true);
  assert.equal(validateMessageContent("a".repeat(2001)).ok, false);
});

test("o limite conta code points (emoji conta como 1), como o char_length do banco", () => {
  assert.equal(validateMessageContent("😀".repeat(2000)).ok, true);
  assert.equal(validateMessageContent("😀".repeat(2001)).ok, false);
});

test("o limite vale depois do trim", () => {
  assert.equal(validateMessageContent(" " + "a".repeat(2000) + " ").ok, true);
});

test("motivo de denúncia inválido é recusado", () => {
  for (const ok of ["spam", "golpe", "assedio", "conteudo_improprio", "outro"]) {
    assert.equal(isReportReason(ok), true, ok);
  }
  for (const bad of ["", "SPAM", "fraude", "'; drop table", null, undefined, 3]) {
    assert.equal(isReportReason(bad), false, String(bad));
  }
});

test("status de resolução aceita só reviewed/dismissed/actioned (não 'open')", () => {
  assert.equal(isReportResolutionStatus("actioned"), true);
  assert.equal(isReportResolutionStatus("open"), false);
  assert.equal(isReportResolutionStatus("banido"), false);
});

test("detalhes da denúncia: opcional, trim, até 500", () => {
  assert.deepEqual(normalizeReportDetails(undefined), { ok: true, details: null });
  assert.deepEqual(normalizeReportDetails("   "), { ok: true, details: null });
  assert.deepEqual(normalizeReportDetails(" ofendeu "), { ok: true, details: "ofendeu" });
  assert.equal(normalizeReportDetails("a".repeat(500)).ok, true);
  assert.equal(normalizeReportDetails("a".repeat(501)).ok, false);
});

test("aviso de comprador desconhecido: só pra loja e só sem pedido pago", () => {
  assert.equal(shouldWarnUnknownBuyer({ viewerIsStoreOwner: true, buyerHasPaidOrderAtStore: false }), true);
  assert.equal(shouldWarnUnknownBuyer({ viewerIsStoreOwner: true, buyerHasPaidOrderAtStore: true }), false);
  assert.equal(shouldWarnUnknownBuyer({ viewerIsStoreOwner: false, buyerHasPaidOrderAtStore: false }), false);
});

const msg = (id: string, sender: string, at: string, text = id) => ({
  id,
  sender_id: sender,
  content: text,
  created_at: at,
});

test("snapshot: pega as 5 últimas, em ordem cronológica, mesmo com entrada embaralhada", () => {
  const all = [
    msg("m7", "b", "2026-10-12T10:07:00Z"),
    msg("m1", "a", "2026-10-12T10:01:00Z"),
    msg("m4", "b", "2026-10-12T10:04:00Z"),
    msg("m2", "b", "2026-10-12T10:02:00Z"),
    msg("m6", "a", "2026-10-12T10:06:00Z"),
    msg("m3", "a", "2026-10-12T10:03:00Z"),
    msg("m5", "a", "2026-10-12T10:05:00Z"),
  ];
  const names = new Map([
    ["a", "Ana"],
    ["b", "Loja"],
  ]);
  const snap = buildReportSnapshot(all, names);
  assert.deepEqual(
    snap.map((s) => s.text),
    ["m3", "m4", "m5", "m6", "m7"],
  );
  assert.deepEqual(snap[0], {
    author_id: "a",
    author_name: "Ana",
    text: "m3",
    at: "2026-10-12T10:03:00Z",
  });
});

test("snapshot com menos de 5 mensagens devolve todas; autor desconhecido vira 'Usuário'", () => {
  const snap = buildReportSnapshot([msg("x", "zzz", "2026-10-12T10:00:00Z")], new Map());
  assert.equal(snap.length, 1);
  assert.equal(snap[0].author_name, "Usuário");
  assert.deepEqual(buildReportSnapshot([], new Map()), []);
});

test("denúncia: bloqueia se há aberta ou criada nas últimas 24h", () => {
  const now = Date.parse("2026-10-12T12:00:00Z");
  assert.equal(canReportAgain([], now), true);
  assert.equal(canReportAgain([{ status: "open", created_at: "2026-10-01T00:00:00Z" }], now), false);
  assert.equal(canReportAgain([{ status: "dismissed", created_at: "2026-10-12T00:00:00Z" }], now), false);
  assert.equal(canReportAgain([{ status: "dismissed", created_at: "2026-10-10T00:00:00Z" }], now), true);
});

test("auditoria: conta denunciantes DISTINTOS e dispara com 3", () => {
  const reports = [{ reporter_id: "a" }, { reporter_id: "a" }, { reporter_id: "b" }];
  assert.equal(countDistinctReporters(reports), 2);
  assert.equal(shouldAlertAdmins(2), false);
  assert.equal(shouldAlertAdmins(countDistinctReporters([...reports, { reporter_id: "c" }])), true);
});

test("erros dos triggers são classificados pela mensagem", () => {
  assert.equal(classifyChatDbError({ message: "chat_rate_limit_messages" }), "rate_limit_messages");
  assert.equal(classifyChatDbError({ message: "chat_rate_limit_conversations" }), "rate_limit_conversations");
  assert.equal(classifyChatDbError({ message: "chat_disabled" }), "disabled");
  assert.equal(classifyChatDbError({ message: "new row violates row-level security policy" }), "other");
  assert.equal(classifyChatDbError(null), "other");
});

test("merge de mensagens não duplica e ordena por data", () => {
  const m = (id: string, at: string): ChatMessage => ({ id, senderId: "a", content: id, createdAt: at });
  const merged = mergeMessages(
    [m("2", "2026-10-12T10:02:00Z"), m("1", "2026-10-12T10:01:00Z")],
    [m("2", "2026-10-12T10:02:00Z"), m("3", "2026-10-12T10:03:00Z")],
  );
  assert.deepEqual(
    merged.map((x) => x.id),
    ["1", "2", "3"],
  );
});

test("quebras de linha viram linhas (CRLF e CR normalizados)", () => {
  assert.deepEqual(splitMessageLines("a\r\nb\rc\nd"), ["a", "b", "c", "d"]);
  assert.deepEqual(splitMessageLines("sem quebra"), ["sem quebra"]);
});
