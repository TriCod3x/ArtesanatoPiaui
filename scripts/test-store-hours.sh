#!/usr/bin/env bash
# Testes unitários do helper de horário (sem dependência nova): compila com o
# tsc do projeto pra um diretório temporário e roda com o test runner nativo
# do Node. Uso: bash scripts/test-store-hours.sh
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT
npx tsc src/lib/store-hours.test.ts --outDir "$OUT" --module commonjs --target es2022 \
  --moduleResolution node --skipLibCheck --types node --esModuleInterop --strict --noEmit false
node --test "$OUT/store-hours.test.js"
