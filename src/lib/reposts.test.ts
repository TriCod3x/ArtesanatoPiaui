import { test } from "node:test";
import assert from "node:assert/strict";
import { decideRepost, resolveRepostTarget, mergeFeed, repostNotificationLink } from "./reposts";

// Rodar: ver scripts/test-community-pack.sh (compila com tsc e roda node --test).
const ME = "me";
const post = { id: "post-1", author_id: "other" };

test("o próprio post não pode ser republicado", () => {
  const d = decideRepost({ userId: ME, target: { id: "p", author_id: ME }, alreadyReposted: false });
  assert.equal(d.kind, "error");
});

test("sem login ou post inexistente é erro", () => {
  assert.equal(decideRepost({ userId: null, target: post, alreadyReposted: false }).kind, "error");
  assert.equal(decideRepost({ userId: ME, target: null, alreadyReposted: false }).kind, "error");
});

test("alterna: primeira vez cria, segunda remove", () => {
  assert.deepEqual(decideRepost({ userId: ME, target: post, alreadyReposted: false }), {
    kind: "add",
    postId: "post-1",
  });
  assert.deepEqual(decideRepost({ userId: ME, target: post, alreadyReposted: true }), {
    kind: "remove",
    postId: "post-1",
  });
});

test("republicar uma republicação aponta pro post original", () => {
  // O id recebido não é de nenhum post; é de uma republicação do post-1.
  const target = resolveRepostTarget({ postById: null, originalOfRepost: post });
  assert.deepEqual(target, post);
  assert.deepEqual(decideRepost({ userId: ME, target, alreadyReposted: false }), {
    kind: "add",
    postId: "post-1",
  });
  // E se o original for meu, continua proibido.
  const mine = resolveRepostTarget({
    postById: null,
    originalOfRepost: { id: "x", author_id: ME },
  });
  assert.equal(decideRepost({ userId: ME, target: mine, alreadyReposted: false }).kind, "error");
  // Id desconhecido não vira alvo.
  assert.equal(resolveRepostTarget({ postById: null, originalOfRepost: null }), null);
});

test("notificação é única por par (usuário, post): o link muda com quem republica", () => {
  assert.equal(repostNotificationLink("p", "u1"), repostNotificationLink("p", "u1"));
  assert.notEqual(repostNotificationLink("p", "u1"), repostNotificationLink("p", "u2"));
  assert.notEqual(repostNotificationLink("p", "u1"), repostNotificationLink("q", "u1"));
});

test("feed: união ordenada por data e corte no limite é o top-N da união", () => {
  const posts = [
    { key: "post-a", sortAt: "2026-10-01T10:00:00Z" },
    { key: "post-b", sortAt: "2026-10-03T10:00:00Z" },
    { key: "post-c", sortAt: "2026-10-05T10:00:00Z" },
  ];
  const reposts = [
    { key: "repost-a", sortAt: "2026-10-04T10:00:00Z" }, // post antigo republicado agora
    { key: "repost-b", sortAt: "2026-10-02T10:00:00Z" },
  ];
  assert.deepEqual(
    mergeFeed([...posts, ...reposts], 3).map((i) => i.key),
    ["post-c", "repost-a", "post-b"],
  );
  // Cada fonte já vem limitada a N; o top-N da união não muda com isso.
  const limited = [...posts.slice(-2), ...reposts.slice(0, 2)];
  assert.deepEqual(
    mergeFeed(limited, 3).map((i) => i.key),
    mergeFeed([...posts, ...reposts], 3).map((i) => i.key),
  );
});
