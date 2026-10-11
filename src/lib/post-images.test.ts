import { test } from "node:test";
import assert from "node:assert/strict";
import {
  validatePostImageUrls,
  checkSourceImage,
  fitWithin,
  resolvePostImages,
} from "./post-images";

// Rodar: ver scripts/test-community-pack.sh (compila com tsc e roda node --test).
const SUPA = "https://tyxzyyhgyopwlfdqumyr.supabase.co";
const ME = "cb042d2c-ad9d-4db2-a93b-b083d20e4553";
const OTHER = "11111111-1111-4111-8111-111111111111";
const mine = (n: string) => `${SUPA}/storage/v1/object/public/community-posts/${ME}/${n}.jpg`;
const opts = { userId: ME, supabaseUrl: SUPA };

test("0 imagens é válido (post só com texto)", () => {
  const r = validatePostImageUrls([], opts);
  assert.ok(r.ok && r.urls.length === 0);
});

test("6 imagens do próprio autor passam; 7 são rejeitadas", () => {
  const six = Array.from({ length: 6 }, (_, i) => mine(`img${i}`));
  const ok = validatePostImageUrls(six, opts);
  assert.ok(ok.ok && ok.urls.length === 6);
  const seven = [...six, mine("img6")];
  assert.equal(validatePostImageUrls(seven, opts).ok, false);
});

test("URL externa é rejeitada", () => {
  assert.equal(validatePostImageUrls(["https://evil.example.com/a.jpg"], opts).ok, false);
  assert.equal(
    validatePostImageUrls(
      [`https://evil.example.com/storage/v1/object/public/community-posts/${ME}/a.jpg`],
      opts,
    ).ok,
    false,
  );
  // Outro projeto Supabase também é "externo".
  assert.equal(
    validatePostImageUrls(
      [`https://outroprojeto.supabase.co/storage/v1/object/public/community-posts/${ME}/a.jpg`],
      opts,
    ).ok,
    false,
  );
});

test("URL da pasta de outro usuário é rejeitada", () => {
  const theirs = `${SUPA}/storage/v1/object/public/community-posts/${OTHER}/a.jpg`;
  assert.equal(validatePostImageUrls([theirs], opts).ok, false);
});

test("outro bucket, travessia de caminho, subpasta, query e http são rejeitados", () => {
  const bad = [
    `${SUPA}/storage/v1/object/public/avatars/${ME}/a.jpg`,
    `${SUPA}/storage/v1/object/public/community-posts/${ME}/../${OTHER}/a.jpg`,
    `${SUPA}/storage/v1/object/public/community-posts/${ME}/sub/a.jpg`,
    `${SUPA}/storage/v1/object/public/community-posts/${ME}/a.jpg?x=1`,
    `http://tyxzyyhgyopwlfdqumyr.supabase.co/storage/v1/object/public/community-posts/${ME}/a.jpg`,
  ];
  for (const url of bad) assert.equal(validatePostImageUrls([url], opts).ok, false, url);
});

test("valores que não são string, duplicadas e não-array são rejeitados", () => {
  assert.equal(validatePostImageUrls([123 as unknown as string], opts).ok, false);
  assert.equal(validatePostImageUrls([mine("a"), mine("a")], opts).ok, false);
  assert.equal(validatePostImageUrls("x", opts).ok, false);
});

test("arquivo de origem: só imagem e até 10MB", () => {
  assert.equal(checkSourceImage({ type: "image/png", size: 1000 }), null);
  assert.ok(checkSourceImage({ type: "application/pdf", size: 1000 }));
  assert.ok(checkSourceImage({ type: "image/jpeg", size: 10 * 1024 * 1024 + 1 }));
  assert.equal(checkSourceImage({ type: "image/jpeg", size: 10 * 1024 * 1024 }), null);
});

test("fitWithin: lado maior vai a 1600, proporção mantida, sem ampliar", () => {
  assert.deepEqual(fitWithin(4000, 3000, 1600), { width: 1600, height: 1200 });
  assert.deepEqual(fitWithin(3000, 4000, 1600), { width: 1200, height: 1600 });
  assert.deepEqual(fitWithin(800, 600, 1600), { width: 800, height: 600 });
});

test("leitura: usa linhas novas; sem linhas cai pro image_url antigo", () => {
  assert.deepEqual(
    resolvePostImages(
      [
        { url: "b", position: 1 },
        { url: "a", position: 0 },
      ],
      "legacy",
    ),
    ["a", "b"],
  );
  assert.deepEqual(resolvePostImages([], "legacy"), ["legacy"]);
  assert.deepEqual(resolvePostImages(null, null), []);
});
