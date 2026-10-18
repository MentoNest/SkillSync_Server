#!/usr/bin/env bash
# Daily PostgreSQL backup (issue #1482).
#
# Dumps the database in custom format, encrypts it with AES-256, uploads it to
# S3 (server-side encrypted), prunes copies older than the retention period and
# writes a status file the admin API reads. Run from cron (see
# docs/BACKUP_AND_RESTORE.md).
#
# Required env: DATABASE_URL, BACKUP_ENCRYPTION_PASSPHRASE, BACKUP_S3_BUCKET
# Optional env: BACKUP_DIR (/var/backups/skillsync), BACKUP_RETENTION_DAYS (30),
#               BACKUP_STATUS_FILE, BACKUP_ALERT_WEBHOOK
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/skillsync}"
RETENTION_DAYS="${BACKUP_RETENTION_DAYS:-30}"
STATUS_FILE="${BACKUP_STATUS_FILE:-$BACKUP_DIR/status.json}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$BACKUP_DIR/skillsync-$STAMP.dump.enc"

mkdir -p "$BACKUP_DIR"

write_status() {
  printf '{"status":"%s","timestamp":"%s","file":"%s","message":"%s"}\n' \
    "$1" "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$(basename "$FILE")" "$2" > "$STATUS_FILE"
}

alert() {
  write_status "failed" "$1"
  echo "BACKUP FAILED: $1" >&2
  if [ -n "${BACKUP_ALERT_WEBHOOK:-}" ]; then
    curl -fsS -X POST -H 'Content-Type: application/json' \
      -d "{\"text\":\"SkillSync backup failed: $1\"}" "$BACKUP_ALERT_WEBHOOK" || true
  fi
  exit 1
}
trap 'alert "unexpected error on line $LINENO"' ERR

: "${DATABASE_URL:?DATABASE_URL is required}"
: "${BACKUP_ENCRYPTION_PASSPHRASE:?BACKUP_ENCRYPTION_PASSPHRASE is required}"

pg_dump --format=custom --no-owner "$DATABASE_URL" \
  | openssl enc -aes-256-cbc -pbkdf2 -salt -pass env:BACKUP_ENCRYPTION_PASSPHRASE -out "$FILE"

if [ -n "${BACKUP_S3_BUCKET:-}" ]; then
  aws s3 cp "$FILE" "s3://$BACKUP_S3_BUCKET/daily/$(basename "$FILE")" --sse AES256
fi

# Retention: keep the last N days locally (configure an S3 lifecycle rule for the bucket).
find "$BACKUP_DIR" -name 'skillsync-*.dump.enc' -mtime +"$RETENTION_DAYS" -delete

write_status "ok" "backup completed"
echo "Backup written to $FILE"
