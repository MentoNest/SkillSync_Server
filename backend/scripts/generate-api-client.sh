#!/usr/bin/env bash
# Generates a typed TypeScript API client from docs/openapi.json for the
# frontend (issue #1484).
#
# Usage: scripts/generate-api-client.sh [output-file]
set -euo pipefail

cd "$(dirname "$0")/.."
OUT="${1:-../generated/api-client.d.ts}"

npm run openapi:generate
mkdir -p "$(dirname "$OUT")"
npx --yes openapi-typescript docs/openapi.json -o "$OUT"
echo "Client types written to $OUT"
