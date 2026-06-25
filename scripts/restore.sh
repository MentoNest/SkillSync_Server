#!/usr/bin/env bash
# =============================================================================
# SkillSync PostgreSQL Restore Script
#
# Downloads an encrypted backup from S3, decrypts it, and restores to a
# PostgreSQL database.
#
# Usage:
#   ./restore.sh <s3-key>
#   ./restore.sh backups/skillsync/20260101T120000Z/skillsync_20260101T120000Z.dump.enc
#
# Required environment variables:
#   DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
#   BACKUP_ENCRYPTION_KEY   – must match the key used during backup
#   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY
#   S3_BUCKET               – e.g. s3://skillsync-backups
#
# WARNING: This script drops and recreates the target database.
# =============================================================================

set -euo pipefail

S3_KEY="${1:?Usage: $0 <s3-key>}"

DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:?DB_NAME is required}"
DB_USER="${DB_USER:?DB_USER is required}"
S3_BUCKET="${S3_BUCKET:?S3_BUCKET is required}"
BACKUP_ENCRYPTION_KEY="${BACKUP_ENCRYPTION_KEY:?BACKUP_ENCRYPTION_KEY is required}"

RESTORE_DIR="/tmp/skillsync-restore-$$"
ENCRYPTED_FILE="${RESTORE_DIR}/restore.dump.enc"
DUMP_FILE="${RESTORE_DIR}/restore.dump"

mkdir -p "${RESTORE_DIR}"
trap 'rm -rf "${RESTORE_DIR}"' EXIT

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Restoring from ${S3_BUCKET}/${S3_KEY}..."

# ---------------------------------------------------------------------------
# 1. Download encrypted backup from S3
# ---------------------------------------------------------------------------
aws s3 cp "${S3_BUCKET}/${S3_KEY}" "${ENCRYPTED_FILE}"
echo "[$(date -u)] Downloaded backup."

# ---------------------------------------------------------------------------
# 2. Decrypt the backup
# ---------------------------------------------------------------------------
openssl enc -aes-256-cbc -pbkdf2 -iter 100000 -d \
  -pass "pass:${BACKUP_ENCRYPTION_KEY}" \
  -in "${ENCRYPTED_FILE}" \
  -out "${DUMP_FILE}"

rm -f "${ENCRYPTED_FILE}"
echo "[$(date -u)] Backup decrypted."

# ---------------------------------------------------------------------------
# 3. Terminate existing connections and drop/recreate database
# ---------------------------------------------------------------------------
export PGPASSWORD="${DB_PASSWORD:?DB_PASSWORD is required}"

echo "[$(date -u)] Terminating active connections to ${DB_NAME}..."
psql \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --username="${DB_USER}" \
  --dbname="postgres" \
  --command="SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname='${DB_NAME}' AND pid <> pg_backend_pid();"

echo "[$(date -u)] Dropping and recreating database ${DB_NAME}..."
dropdb \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --username="${DB_USER}" \
  --if-exists \
  "${DB_NAME}"

createdb \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --username="${DB_USER}" \
  "${DB_NAME}"

# ---------------------------------------------------------------------------
# 4. Restore from dump
# ---------------------------------------------------------------------------
echo "[$(date -u)] Restoring database..."
pg_restore \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --username="${DB_USER}" \
  --dbname="${DB_NAME}" \
  --no-password \
  --verbose \
  --exit-on-error \
  "${DUMP_FILE}"

unset PGPASSWORD

echo "[$(date -u)] Restore complete."
