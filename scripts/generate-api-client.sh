#!/usr/bin/env bash
# =============================================================================
# SkillSync – API Client Generation Script
#
# Generates a TypeScript client library from the OpenAPI specification
# produced by @nestjs/swagger.
#
# Usage:
#   ./scripts/generate-api-client.sh [--output <dir>] [--package-name <name>]
#
# Prerequisites:
#   - Node.js 18+
#   - Running SkillSync backend OR OPENAPI_URL pointing to an existing spec
#
# Options:
#   --output <dir>         Output directory (default: ../frontend/src/api-client)
#   --package-name <name>  NPM package name    (default: @skillsync/api-client)
#   --spec-url <url>       URL to OpenAPI JSON  (default: http://localhost:3000/api-docs-json)
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "${SCRIPT_DIR}")"

OUTPUT_DIR="${OUTPUT_DIR:-${REPO_ROOT}/frontend/src/api-client}"
PACKAGE_NAME="${PACKAGE_NAME:-@skillsync/api-client}"
SPEC_URL="${OPENAPI_URL:-http://localhost:3000/api-docs-json}"
SPEC_FILE="/tmp/skillsync-openapi.json"

echo "Fetching OpenAPI spec from ${SPEC_URL}..."
curl -sf "${SPEC_URL}" -o "${SPEC_FILE}" || {
  echo "ERROR: Could not fetch spec from ${SPEC_URL}. Is the backend running?"
  echo "       Start it with: cd backend && npm run start:dev"
  exit 1
}

echo "Generating TypeScript client into ${OUTPUT_DIR}..."
mkdir -p "${OUTPUT_DIR}"

# Use openapi-generator-cli (requires Java) if available, otherwise npx openapi-typescript
if command -v openapi-generator-cli &>/dev/null || command -v openapi-generator &>/dev/null; then
  GENERATOR="${GENERATOR:-openapi-generator-cli}"
  command -v openapi-generator &>/dev/null && GENERATOR="openapi-generator"

  "${GENERATOR}" generate \
    --input-spec "${SPEC_FILE}" \
    --generator-name typescript-fetch \
    --output "${OUTPUT_DIR}" \
    --additional-properties="npmName=${PACKAGE_NAME},supportsES6=true,typescriptThreePlus=true"
else
  echo "openapi-generator not found – using openapi-typescript (schema types only)..."
  npx --yes openapi-typescript "${SPEC_FILE}" --output "${OUTPUT_DIR}/schema.ts"
fi

echo "Done. Client written to ${OUTPUT_DIR}"
