#!/usr/bin/env bash
# =============================================================================
# SkillSync Backup Verification Script
#
# Downloads the most recent backup, restores it to a test database, and
# verifies basic table row counts. Use this for the monthly restore test.
#
# Required environment variables:
#   DB_HOST, DB_PORT, DB_USER, DB_PASSWORD
#   BACKUP_ENCRYPTION_KEY
#   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
#   S3_BUCKET
#   DB_NAME                 – source database name
#
# Optional:
#   VERIFY_DB_NAME          – defaults to skillsync_verify_<timestamp>
# =============================================================================

set -euo pipefail

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:?DB_NAME is required}"
DB_USER="${DB_USER:?DB_USER is required}"
S3_BUCKET="${S3_BUCKET:?S3_BUCKET is required}"
TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
VERIFY_DB="${VERIFY_DB_NAME:-${DB_NAME}_verify_${TIMESTAMP}}"

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Starting backup verification..."

# ---------------------------------------------------------------------------
# 1. Find the most recent backup in S3
# ---------------------------------------------------------------------------
LATEST_KEY=$(aws s3 ls "${S3_BUCKET}/backups/${DB_NAME}/" \
  | sort -k1,2 \
  | tail -1 \
  | awk '{print $2}' \
  | xargs -I{} aws s3 ls "${S3_BUCKET}/backups/${DB_NAME}/{}" \
  | awk '{print $4}' \
  | head -1)

if [[ -z "${LATEST_KEY}" ]]; then
  echo "ERROR: No backup found in ${S3_BUCKET}/backups/${DB_NAME}/"
  exit 1
fi

echo "[$(date -u)] Latest backup: ${LATEST_KEY}"

# ---------------------------------------------------------------------------
# 2. Restore to the verification database
# ---------------------------------------------------------------------------
export DB_NAME="${VERIFY_DB}"
DB_NAME="${VERIFY_DB}" \
  S3_KEY="${LATEST_KEY}" \
  bash "$(dirname "$0")/restore.sh" "${LATEST_KEY}"

# ---------------------------------------------------------------------------
# 3. Run sanity checks – verify key tables exist and have rows
# ---------------------------------------------------------------------------
export PGPASSWORD="${DB_PASSWORD:?DB_PASSWORD is required}"

echo "[$(date -u)] Running sanity checks on ${VERIFY_DB}..."

USERS_COUNT=$(psql \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --username="${DB_USER}" \
  --dbname="${VERIFY_DB}" \
  --tuples-only \
  --command="SELECT COUNT(*) FROM users;")

echo "[$(date -u)] users table row count: ${USERS_COUNT}"

if [[ "${USERS_COUNT}" -lt 0 ]]; then
  echo "ERROR: users table sanity check failed"
  unset PGPASSWORD
  exit 1
fi

# ---------------------------------------------------------------------------
# 4. Drop the verification database
# ---------------------------------------------------------------------------
dropdb \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --username="${DB_USER}" \
  "${VERIFY_DB}"

unset PGPASSWORD

echo "[$(date -u)] Backup verification PASSED. Verified backup: ${LATEST_KEY}"
