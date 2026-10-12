import { test } from "node:test";
import assert from "node:assert/strict";
import { renderToStaticMarkup } from "react-dom/server";
import { MessageText } from "./MessageText";

// Rodar: ver scripts/test-chat-moderation.sh.

test("<script> aparece como texto escapado, nunca como tag", () => {
  const html = renderToStaticMarkup(<MessageText content={'<script>alert("x")</script>'} />);
  assert.ok(!html.includes("<script"), html);
  assert.ok(html.includes("&lt;script&gt;"), html);
});

test("HTML e atributos perigosos ficam inertes", () => {
  const html = renderToStaticMarkup(
    <MessageText content={'<img src=x onerror=alert(1)> <a href="javascript:alert(1)">oi</a>'} />,
  );
  assert.ok(!html.includes("<img"), html);
  assert.ok(!html.includes("<a "), html);
});

test("URL aparece como texto, sem link clicável", () => {
  const html = renderToStaticMarkup(<MessageText content="veja https://exemplo.com/x" />);
  assert.ok(html.includes("https://exemplo.com/x"));
  assert.ok(!html.includes("<a"), html);
});

test("quebras de linha viram <br>", () => {
  const html = renderToStaticMarkup(<MessageText content={"linha 1\nlinha 2"} />);
  assert.ok(html.includes("linha 1<br/>linha 2"), html);
});
