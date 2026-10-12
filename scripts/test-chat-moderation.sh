#!/usr/bin/env bash
# Testes unitários do chat com moderação (validação de conteúdo, denúncia,
# snapshot, aviso de comprador desconhecido, renderização de texto). Sem
# dependência nova: compila com o tsc do projeto pra um diretório temporário e
# roda com o test runner nativo do Node. Só funções puras: nada toca o banco.
# Uso: bash scripts/test-chat-moderation.sh
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT
npx tsc src/lib/chat.test.ts src/components/messages/MessageText.test.tsx \
  --outDir "$OUT" --rootDir src --module commonjs --target es2022 --jsx react-jsx \
  --moduleResolution node --skipLibCheck --types node --esModuleInterop --strict --noEmit false
# O teste do componente importa react/react-dom do node_modules do projeto.
NODE_PATH="$PWD/node_modules" node --test "$OUT/lib/chat.test.js" "$OUT/components/messages/MessageText.test.js"
