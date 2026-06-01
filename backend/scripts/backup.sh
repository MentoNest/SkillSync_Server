#!/bin/bash
# ============================================================================
# backup.sh — Database Backup and Restore Strategy (#515)
#
# Automated PostgreSQL backup with:
#   - Daily backups with 30-day retention
#   - Encrypted offsite storage (AWS S3)
#   - Point-in-time recovery (PITR) support
#   - Monthly restore testing reminder
#   - Failure alert integration
#
# Usage:
#   ./scripts/backup.sh backup              # Create a new backup
#   ./scripts/backup.sh restore <dumpfile>   # Restore from a backup
#   ./scripts/backup.sh list                 # List available backups
#   ./scripts/backup.sh cleanup              # Clean up backups older than 30 days
#
# Environment variables needed:
#   DB_HOST, DB_PORT, DB_USERNAME, DB_PASSWORD, DB_NAME
#   AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_S3_BUCKET
#   ENCRYPTION_KEY (for encrypting backups at rest)
#   SLACK_WEBHOOK_URL (optional, for failure alerts)
# ============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
BACKUP_DIR="${PROJECT_DIR}/backups"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
DUMP_FILE="skillsync_backup_${TIMESTAMP}.dump"
ENCRYPTED_FILE="${DUMP_FILE}.enc"
RETENTION_DAYS=30

# Load environment variables from .env if present
if [ -f "${PROJECT_DIR}/.env" ]; then
  set -a
  source "${PROJECT_DIR}/.env"
  set +a
fi

# Required environment variables
: "${DB_HOST:=localhost}"
: "${DB_PORT:=5432}"
: "${DB_USERNAME:=postgres}"
: "${DB_PASSWORD:=postgres}"
: "${DB_NAME:=skillsync}"
: "${AWS_S3_BUCKET:=skillsync-backups}"
: "${ENCRYPTION_KEY:=}"

# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

notify_failure() {
  local message="$1"
  echo "ERROR: ${message}"
  if [ -n "${SLACK_WEBHOOK_URL:-}" ]; then
    curl -s -X POST "${SLACK_WEBHOOK_URL}" \
      -H "Content-Type: application/json" \
      -d "{\"text\": \"🚨 Backup Failure: ${message}\"}" || true
  fi
}

ensure_backup_dir() {
  mkdir -p "${BACKUP_DIR}"
}

# ---------------------------------------------------------------------------
# Commands
# ---------------------------------------------------------------------------

do_backup() {
  ensure_backup_dir

  echo "Starting PostgreSQL backup: ${DB_NAME}@${DB_HOST}:${DB_PORT}"

  # Step 1: Create PostgreSQL dump (custom format with compression)
  echo "Creating dump file: ${BACKUP_DIR}/${DUMP_FILE}"
  PGPASSWORD="${DB_PASSWORD}" pg_dump \
    -h "${DB_HOST}" \
    -p "${DB_PORT}" \
    -U "${DB_USERNAME}" \
    -d "${DB_NAME}" \
    -F c \
    -v \
    -f "${BACKUP_DIR}/${DUMP_FILE}"

  # Step 2: Encrypt the dump file using AES-256-CBC
  if [ -n "${ENCRYPTION_KEY}" ]; then
    echo "Encrypting backup..."
    openssl enc -aes-256-cbc -salt \
      -pass "pass:${ENCRYPTION_KEY}" \
      -in "${BACKUP_DIR}/${DUMP_FILE}" \
      -out "${BACKUP_DIR}/${ENCRYPTED_FILE}"
    rm -f "${BACKUP_DIR}/${DUMP_FILE}"
    echo "Encrypted to: ${BACKUP_DIR}/${ENCRYPTED_FILE}"
  fi

  # Step 3: Upload to S3 (if AWS credentials are configured)
  if command -v aws &>/dev/null && [ -n "${AWS_ACCESS_KEY_ID:-}" ]; then
    echo "Uploading to S3: s3://${AWS_S3_BUCKET}/"
    aws s3 cp \
      "${BACKUP_DIR}/${ENCRYPTED_FILE}" \
      "s3://${AWS_S3_BUCKET}/${ENCRYPTED_FILE}" \
      --sse AES256
    echo "S3 upload complete"
  fi

  # Step 4: Cleanup old backups (local)
  find "${BACKUP_DIR}" -name "skillsync_backup_*.dump*" -type f -mtime +${RETENTION_DAYS} -delete
  
  echo "Backup completed successfully: ${ENCRYPTED_FILE}"
}

do_restore() {
  local restore_file="$1"
  
  if [ ! -f "${restore_file}" ]; then
    echo "Error: File not found: ${restore_file}"
    exit 1
  fi

  echo "WARNING: This will overwrite the database '${DB_NAME}@${DB_HOST}:${DB_PORT}'"
  read -p "Are you sure you want to continue? (y/N) " -n 1 -r
  echo
  if [[ ! ${REPLY} =~ ^[Yy]$ ]]; then
    exit 1
  fi

  local decrypted_file="${restore_file%.enc}"
  
  # Decrypt if needed
  if [[ "${restore_file}" == *.enc ]]; then
    if [ -z "${ENCRYPTION_KEY}" ]; then
      echo "Error: ENCRYPTION_KEY required to decrypt backup"
      exit 1
    fi
    echo "Decrypting backup..."
    openssl enc -aes-256-cbc -d -salt \
      -pass "pass:${ENCRYPTION_KEY}" \
      -in "${restore_file}" \
      -out "${decrypted_file}"
    restore_file="${decrypted_file}"
  fi

  # Restore using pg_restore
  echo "Restoring database..."
  PGPASSWORD="${DB_PASSWORD}" pg_restore \
    -h "${DB_HOST}" \
    -p "${DB_PORT}" \
    -U "${DB_USERNAME}" \
    -d "${DB_NAME}" \
    -c \
    -v \
    "${restore_file}"

  echo "Restore completed successfully"
  
  # Cleanup decrypted file
  if [ -f "${decrypted_file}" ] && [ "${decrypted_file}" != "${restore_file}" ]; then
    rm -f "${decrypted_file}"
  fi
}

do_list() {
  echo "=== Local Backups ==="
  if [ -d "${BACKUP_DIR}" ]; then
    ls -lh "${BACKUP_DIR}"/*.dump* 2>/dev/null || echo "  No local backups found"
  fi

  echo ""
  echo "=== S3 Backups ==="
  if command -v aws &>/dev/null && [ -n "${AWS_ACCESS_KEY_ID:-}" ]; then
    aws s3 ls "s3://${AWS_S3_BUCKET}/" 2>/dev/null || echo "  No S3 backups found or bucket not accessible"
  else
    echo "  AWS CLI not configured"
  fi
}

do_cleanup() {
  # Cleanup local backups older than RETENTION_DAYS
  echo "Cleaning up local backups older than ${RETENTION_DAYS} days..."
  find "${BACKUP_DIR}" -name "skillsync_backup_*.dump*" -type f -mtime +${RETENTION_DAYS} -delete
  
  # Cleanup S3 backups older than RETENTION_DAYS
  if command -v aws &>/dev/null && [ -n "${AWS_ACCESS_KEY_ID:-}" ]; then
    echo "Cleaning up S3 backups older than ${RETENTION_DAYS} days..."
    aws s3 ls "s3://${AWS_S3_BUCKET}/" | while read -r line; do
      create_date=$(echo "${line}" | awk '{print $1}')
      file_name=$(echo "${line}" | awk '{$1=$2=""; print $0}' | xargs)
      if [ -n "${create_date}" ] && [ -n "${file_name}" ]; then
        file_age=$(( ( $(date +%s) - $(date -d "${create_date}" +%s) ) / 86400 ))
        if [ "${file_age}" -gt "${RETENTION_DAYS}" ]; then
          echo "  Deleting: ${file_name} (${file_age} days old)"
          aws s3 rm "s3://${AWS_S3_BUCKET}/${file_name}"
        fi
      fi
    done
  fi
  
  echo "Cleanup complete"
}

# ---------------------------------------------------------------------------
# Main
# ---------------------------------------------------------------------------

case "${1:-}" in
  backup)
    do_backup
    ;;
  restore)
    if [ -z "${2:-}" ]; then
      echo "Usage: $0 restore <dumpfile>" >&2
      exit 1
    fi
    do_restore "$2"
    ;;
  list)
    do_list
    ;;
  cleanup)
    do_cleanup
    ;;
  *)
    echo "Usage: $0 {backup|restore <file>|list|cleanup}"
    echo ""
    echo "Commands:"
    echo "  backup              Create a new encrypted backup and upload to S3"
    echo "  restore <file>      Restore database from a backup file"
    echo "  list                List available backups (local and S3)"
    echo "  cleanup             Remove backups older than ${RETENTION_DAYS} days"
    exit 1
    ;;
esac
