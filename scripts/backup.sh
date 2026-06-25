#!/usr/bin/env bash
# =============================================================================
# SkillSync PostgreSQL Backup Script
#
# Creates an encrypted, compressed pg_dump backup and uploads it to S3.
#
# Required environment variables:
#   DB_HOST, DB_PORT, DB_NAME, DB_USER, DB_PASSWORD
#   BACKUP_ENCRYPTION_KEY   – openssl symmetric key (passphrase)
#   AWS_ACCESS_KEY_ID       – AWS credentials
#   AWS_SECRET_ACCESS_KEY
#   S3_BUCKET               – e.g. s3://skillsync-backups
#
# Optional:
#   BACKUP_RETENTION_DAYS   – defaults to 30
#   BACKUP_DIR              – local staging dir, defaults to /tmp/skillsync-backups
# =============================================================================

set -euo pipefail

TIMESTAMP=$(date -u +"%Y%m%dT%H%M%SZ")
DB_HOST="${DB_HOST:-localhost}"
DB_PORT="${DB_PORT:-5432}"
DB_NAME="${DB_NAME:?DB_NAME is required}"
DB_USER="${DB_USER:?DB_USER is required}"
BACKUP_DIR="${BACKUP_DIR:-/tmp/skillsync-backups}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
S3_BUCKET="${S3_BUCKET:?S3_BUCKET is required}"
BACKUP_ENCRYPTION_KEY="${BACKUP_ENCRYPTION_KEY:?BACKUP_ENCRYPTION_KEY is required}"

DUMP_FILE="${BACKUP_DIR}/${DB_NAME}_${TIMESTAMP}.dump"
ENCRYPTED_FILE="${DUMP_FILE}.enc"
STATUS_FILE="${BACKUP_DIR}/last_backup_status.json"

mkdir -p "${BACKUP_DIR}"

echo "[$(date -u +"%Y-%m-%dT%H:%M:%SZ")] Starting backup of ${DB_NAME}..."

# ---------------------------------------------------------------------------
# 1. Create compressed pg_dump (custom format, supports parallel restore)
# ---------------------------------------------------------------------------
export PGPASSWORD="${DB_PASSWORD:?DB_PASSWORD is required}"
pg_dump \
  --host="${DB_HOST}" \
  --port="${DB_PORT}" \
  --username="${DB_USER}" \
  --dbname="${DB_NAME}" \
  --format=custom \
  --compress=9 \
  --no-password \
  --file="${DUMP_FILE}"
unset PGPASSWORD

DUMP_SIZE=$(stat -c%s "${DUMP_FILE}" 2>/dev/null || stat -f%z "${DUMP_FILE}")
echo "[$(date -u)] Dump complete. Size: ${DUMP_SIZE} bytes."

# ---------------------------------------------------------------------------
# 2. Encrypt the dump with AES-256-CBC
# ---------------------------------------------------------------------------
openssl enc -aes-256-cbc -pbkdf2 -iter 100000 \
  -pass "pass:${BACKUP_ENCRYPTION_KEY}" \
  -in "${DUMP_FILE}" \
  -out "${ENCRYPTED_FILE}"

# Remove plaintext dump immediately
rm -f "${DUMP_FILE}"
echo "[$(date -u)] Dump encrypted."

# ---------------------------------------------------------------------------
# 3. Upload to S3
# ---------------------------------------------------------------------------
S3_KEY="backups/${DB_NAME}/${TIMESTAMP}/${DB_NAME}_${TIMESTAMP}.dump.enc"
aws s3 cp "${ENCRYPTED_FILE}" "${S3_BUCKET}/${S3_KEY}" \
  --storage-class STANDARD_IA \
  --metadata "db=${DB_NAME},timestamp=${TIMESTAMP}"

echo "[$(date -u)] Uploaded to ${S3_BUCKET}/${S3_KEY}."

# ---------------------------------------------------------------------------
# 4. Enforce retention policy – delete objects older than RETENTION_DAYS
# ---------------------------------------------------------------------------
CUTOFF_DATE=$(date -u -d "${RETENTION_DAYS} days ago" +"%Y-%m-%d" 2>/dev/null \
  || date -u -v-"${RETENTION_DAYS}"d +"%Y-%m-%d")

echo "[$(date -u)] Pruning backups older than ${CUTOFF_DATE}..."
aws s3 ls "${S3_BUCKET}/backups/${DB_NAME}/" \
  | awk '{print $2}' \
  | while read -r prefix; do
      folder_date=$(echo "${prefix}" | grep -oE '[0-9]{8}' | head -1)
      if [[ -n "${folder_date}" ]]; then
        folder_date_fmt="${folder_date:0:4}-${folder_date:4:2}-${folder_date:6:2}"
        if [[ "${folder_date_fmt}" < "${CUTOFF_DATE}" ]]; then
          echo "  Deleting ${S3_BUCKET}/backups/${DB_NAME}/${prefix}"
          aws s3 rm "${S3_BUCKET}/backups/${DB_NAME}/${prefix}" --recursive
        fi
      fi
    done

# ---------------------------------------------------------------------------
# 5. Write local status file (read by NestJS backup status endpoint)
# ---------------------------------------------------------------------------
cat > "${STATUS_FILE}" <<JSON
{
  "lastBackup": {
    "timestamp": "${TIMESTAMP}",
    "database": "${DB_NAME}",
    "s3Key": "${S3_KEY}",
    "s3Bucket": "${S3_BUCKET}",
    "status": "success"
  },
  "writtenAt": "$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
}
JSON

# Clean up local encrypted file
rm -f "${ENCRYPTED_FILE}"

echo "[$(date -u)] Backup complete: ${S3_KEY}"
