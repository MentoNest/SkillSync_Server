#!/usr/bin/env bash
# Restore an encrypted backup produced by pg-backup.sh (issue #1482).
#
# Usage: pg-restore.sh <backup-file.dump.enc> <target-database-url>
# Required env: BACKUP_ENCRYPTION_PASSPHRASE
#
# WARNING: --clean drops existing objects in the target database. Restore into
# a scratch database first unless this is a real disaster recovery.
set -euo pipefail

FILE="${1:?backup file required}"
TARGET="${2:?target database url required}"
: "${BACKUP_ENCRYPTION_PASSPHRASE:?BACKUP_ENCRYPTION_PASSPHRASE is required}"

openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_ENCRYPTION_PASSPHRASE -in "$FILE" \
  | pg_restore --clean --if-exists --no-owner --dbname "$TARGET"

echo "Restore complete."
