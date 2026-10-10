#!/usr/bin/env bash
# Testes unitários da validação de frete do createOrder (sem dependência
# nova): compila com o tsc do projeto pra um diretório temporário e roda com o
# test runner nativo do Node. Uso: bash scripts/test-shipping-validation.sh
set -euo pipefail
cd "$(dirname "$0")/.."
OUT="$(mktemp -d)"
trap 'rm -rf "$OUT"' EXIT
npx tsc src/lib/shipping-validation.test.ts --outDir "$OUT" --module commonjs --target es2022 \
  --moduleResolution node --skipLibCheck --types node --esModuleInterop --strict --noEmit false
node --test "$OUT/shipping-validation.test.js"
