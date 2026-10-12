#!/usr/bin/env bash
# Testes unitários da regra "loja sem Mercado Pago não vende" e do checklist
# do dashboard (sem dependência nova): compila com o tsc do projeto pra um
# diretório temporário e roda com o test runner nativo do Node.
# Uso: bash scripts/test-store-payments.sh
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT
npx tsc src/lib/store-payments.test.ts --outDir "$OUT" --module commonjs --target es2022 \
  --moduleResolution node --skipLibCheck --types node --esModuleInterop --strict --noEmit false
node --test "$OUT/store-payments.test.js"
