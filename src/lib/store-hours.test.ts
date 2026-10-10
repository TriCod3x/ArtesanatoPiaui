import { test } from "node:test";
import assert from "node:assert/strict";
import { isExpressAvailableNow, getStoreLocalTime, type StoreHoursRow } from "./store-hours";
import { EXPRESS_PICKUP_BUFFER_MINUTES } from "./constants";

// Rodar: ver scripts/test-store-hours.sh (compila com tsc e roda node --test).
// 2026-10-10 é sábado (weekday 6). Fortaleza = UTC-3, sem horário de verão.
const allDays = (opens: string, closes: string): StoreHoursRow[] =>
  [0, 1, 2, 3, 4, 5, 6].map((weekday) => ({ weekday, opens, closes }));

const PREP = 30;
const NEED = PREP + EXPRESS_PICKUP_BUFFER_MINUTES; // 50 min
const reasonOf = (r: ReturnType<typeof isExpressAvailableNow>) => (r.available ? null : r.reason);

test("aberta com folga", () => {
  // 15:00Z = 12:00 local, fecha 18:00
  const r = isExpressAvailableNow({
    hours: allDays("08:00:00", "18:00:00"),
    paused: false,
    prepMinutes: PREP,
    now: new Date("2026-10-10T15:00:00Z"),
  });
  assert.deepEqual(r, { available: true });
});

test("fecha em menos de prep+buffer", () => {
  // 20:30Z = 17:30 local; fecha 18:00 -> faltam 30 < 50
  const r = isExpressAvailableNow({
    hours: allDays("08:00", "18:00"),
    paused: false,
    prepMinutes: PREP,
    now: new Date("2026-10-10T20:30:00Z"),
  });
  assert.deepEqual(r, { available: false, reason: "fecha em breve", today: { opens: "08:00", closes: "18:00" } });
});

test("antes de abrir", () => {
  // 10:00Z = 07:00 local; abre 08:00
  const r = isExpressAvailableNow({
    hours: allDays("08:00", "18:00"),
    paused: false,
    prepMinutes: PREP,
    now: new Date("2026-10-10T10:00:00Z"),
  });
  assert.deepEqual(r, { available: false, reason: "fechada", today: { opens: "08:00", closes: "18:00" } });
});

test("dia sem linha (loja só abre na segunda; hoje é sábado)", () => {
  const r = isExpressAvailableNow({
    hours: [{ weekday: 1, opens: "08:00", closes: "18:00" }],
    paused: false,
    prepMinutes: PREP,
    now: new Date("2026-10-10T15:00:00Z"),
  });
  assert.deepEqual(r, { available: false, reason: "fechada", today: null });
});

test("pausada, mesmo aberta com folga", () => {
  const r = isExpressAvailableNow({
    hours: allDays("08:00", "18:00"),
    paused: true,
    prepMinutes: PREP,
    now: new Date("2026-10-10T15:00:00Z"),
  });
  assert.equal(reasonOf(r), "pausada");
});

test("sem horário nenhum", () => {
  const r = isExpressAvailableNow({
    hours: [],
    paused: false,
    prepMinutes: PREP,
    now: new Date("2026-10-10T15:00:00Z"),
  });
  assert.deepEqual(r, { available: false, reason: "sem horário", today: null });
});

test("fronteira exata: now + prep + buffer == closes é permitido", () => {
  // closes 18:00 local = 21:00Z
  const r = isExpressAvailableNow({
    hours: allDays("08:00", "18:00"),
    paused: false,
    prepMinutes: PREP,
    now: new Date(Date.parse("2026-10-10T21:00:00Z") - NEED * 60_000),
  });
  assert.deepEqual(r, { available: true });
});

test("um segundo depois da fronteira já não é permitido", () => {
  const r = isExpressAvailableNow({
    hours: allDays("08:00", "18:00"),
    paused: false,
    prepMinutes: PREP,
    now: new Date(Date.parse("2026-10-10T21:00:00Z") - NEED * 60_000 + 1000),
  });
  assert.equal(reasonOf(r), "fecha em breve");
});

test("now == closes: fechada", () => {
  const r = isExpressAvailableNow({
    hours: allDays("08:00", "18:00"),
    paused: false,
    prepMinutes: PREP,
    now: new Date("2026-10-10T21:00:00Z"),
  });
  assert.equal(reasonOf(r), "fechada");
});

test("now == opens: aberta", () => {
  const r = isExpressAvailableNow({
    hours: allDays("08:00", "18:00"),
    paused: false,
    prepMinutes: PREP,
    now: new Date("2026-10-10T11:00:00Z"),
  });
  assert.deepEqual(r, { available: true });
});

test("armadilha do fuso: 2026-10-10T02:00:00Z é 23:00 do dia 9 em Fortaleza", () => {
  const local = getStoreLocalTime(new Date("2026-10-10T02:00:00Z"));
  assert.equal(local.secondsOfDay, 23 * 3600);
  assert.equal(local.weekday, 5); // 9/10/2026 é sexta (em UTC já seria sábado)

  // Loja abre só no sábado: em UTC "hoje" seria sábado e pareceria aberta;
  // em Fortaleza ainda é sexta, sem linha -> fechada.
  const r = isExpressAvailableNow({
    hours: [{ weekday: 6, opens: "00:00", closes: "23:59" }],
    paused: false,
    prepMinutes: PREP,
    now: new Date("2026-10-10T02:00:00Z"),
  });
  assert.deepEqual(r, { available: false, reason: "fechada", today: null });

  // Sexta aberta até 23:30: 23:00 + 50 min passa do fechamento.
  const r2 = isExpressAvailableNow({
    hours: [{ weekday: 5, opens: "08:00", closes: "23:30" }],
    paused: false,
    prepMinutes: PREP,
    now: new Date("2026-10-10T02:00:00Z"),
  });
  assert.equal(reasonOf(r2), "fecha em breve");
});
