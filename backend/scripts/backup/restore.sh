#!/usr/bin/env bash
#
# Manual logical restore from a pg_dump custom-format backup (issue #1714).
#
# Restores either the most recent local artefact or an explicit file, decrypting
# it first when it ends in `.gpg`. By default the dump is restored into PG* as
# configured; pass RESTORE_DATABASE to target a different database (recommended
# for verification and dry runs).
#
# Usage:
#   scripts/backup/restore.sh [path/to/skillsync-*.dump[.gpg]]
#
# Environment:
#   RESTORE_DATABASE   target database name (default: ${PGDATABASE})
#   RESTORE_CLEAN      "true" to DROP objects before restore (destructive)
#   BACKUP_DIR         where local artefacts live
#   BACKUP_ENCRYPTION_* / BACKUP_ENCRYPTION_PASSPHRASE for .gpg inputs
#
# See docs/database-backup-restore.md and docs/emergency-restore-runbook.md.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
. "${SCRIPT_DIR}/lib/common.sh"

S3_KEY=""
CLEAN="${RESTORE_CLEAN:-false}"
CLEAN_ARGS=()
[ "${CLEAN}" = "true" ] && CLEAN_ARGS=(--clean --if-exists)

main() {
  require_cmd pg_restore gpg
  require_encryption_passphrase

  local input="${1:-}"
  if [ -z "${input}" ]; then
    # Default to the newest local encrypted artefact.
    input="$(find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'skillsync-*.dump.gpg' \
      -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -n1 | awk '{print $2}')"
    [ -n "${input}" ] || die "no backup found in ${BACKUP_DIR}; pass a path explicitly"
    log "No path given; using newest local backup: ${input}"
  fi
  [ -f "${input}" ] || die "backup file not found: ${input}"

  local target="${RESTORE_DATABASE:-${PGDATABASE}}"
  [ -n "${target}" ] || die "target database is empty (set RESTORE_DATABASE or PGDATABASE)"

  local dump="${input}" tmp=""
  if [[ "${input}" == *.gpg ]]; then
    tmp="$(mktemp -t skillsync-restore-XXXXXX.dump)"
    log "Decrypting ${input}"
    decrypt_file "${input}" "${tmp}"
    dump="${tmp}"
  fi

  # Guard against restoring a truncated/unreadable archive.
  pg_restore --list "${dump}" >/dev/null || die "not a valid pg_dump archive: ${dump}"

  log "Restoring $(basename "${input}") into ${target}@${PGHOST}:${PGPORT}"
  if [ "${#CLEAN_ARGS[@]}" -gt 0 ]; then
    log "WARNING: RESTORE_CLEAN=true — dropping existing objects in ${target}"
  fi

  PGDATABASE="${target}" pg_restore \
    --dbname="${target}" \
    --no-owner --no-privileges \
    --exit-on-error \
    "${CLEAN_ARGS[@]}" \
    "${dump}"

  [ -n "${tmp}" ] && rm -f "${tmp}"
  log "Restore complete into ${target}"
}

main "$@"
