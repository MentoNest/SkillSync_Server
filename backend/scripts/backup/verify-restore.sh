#!/usr/bin/env bash
# Monthly restore test (issue #1482): restores the newest backup into a
# throw-away database and checks that core tables are readable.
#
# Required env: BACKUP_ENCRYPTION_PASSPHRASE, ADMIN_DATABASE_URL (a URL that
# can CREATE/DROP databases), BACKUP_DIR (default /var/backups/skillsync)
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/var/backups/skillsync}"
: "${ADMIN_DATABASE_URL:?ADMIN_DATABASE_URL is required}"
LATEST="$(ls -1t "$BACKUP_DIR"/skillsync-*.dump.enc | head -n1)"
SCRATCH="skillsync_restore_test_$$"
SCRATCH_URL="${ADMIN_DATABASE_URL%/*}/$SCRATCH"

psql "$ADMIN_DATABASE_URL" -c "CREATE DATABASE \"$SCRATCH\""
trap 'psql "$ADMIN_DATABASE_URL" -c "DROP DATABASE IF EXISTS \"$SCRATCH\""' EXIT

"$(dirname "$0")/pg-restore.sh" "$LATEST" "$SCRATCH_URL"
psql "$SCRATCH_URL" -tAc "SELECT count(*) FROM users" >/dev/null

echo "Restore verification passed for $(basename "$LATEST")."
