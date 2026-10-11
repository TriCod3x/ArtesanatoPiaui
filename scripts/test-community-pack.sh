#!/usr/bin/env bash
# Testes unitários do pacote Comunidade/Carrinho (menções, imagens de post,
# pedir de novo, republicação). Sem dependência nova: compila com o tsc do
# projeto pra um diretório temporário e roda com o test runner nativo do Node.
# Uso: bash scripts/test-community-pack.sh
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT
npx tsc src/lib/mentions.test.ts src/lib/post-images.test.ts src/lib/reorder.test.ts src/lib/reposts.test.ts \
  --outDir "$OUT" --module commonjs --target es2022 \
  --moduleResolution node --skipLibCheck --types node --esModuleInterop --strict --noEmit false
node --test "$OUT/mentions.test.js" "$OUT/post-images.test.js" "$OUT/reorder.test.js" "$OUT/reposts.test.js"
