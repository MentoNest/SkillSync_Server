#!/usr/bin/env bash
#
# Point-in-time recovery (PITR) restore (issue #1714).
#
# Rebuilds a PostgreSQL data directory from a physical base backup
# (basebackup.sh) and replays archived WAL segments (wal-archive.sh) up to a
# target time, transaction id or named restore point.
#
# This is a destructive, operator-run procedure. It never touches the live data
# directory: everything is staged under PITR_DATA_DIR and you start the rebuilt
# cluster yourself (or point the container at it). See
# docs/emergency-restore-runbook.md for the full procedure.
#
# Usage:
#   scripts/backup/pitr-restore.sh <base-backup.tar.gz>
#
# Environment:
#   PITR_DATA_DIR            target (empty) data directory (default: /var/lib/postgresql/pitr)
#   PITR_TARGET_TIME         e.g. '2026-11-23 09:30:00+00'
#   PITR_TARGET_XID          e.g. 1234567
#   PITR_TARGET_NAME         named restore point
#   PITR_RECOVERY_ACTION     'promote' (default) or 'pause'
#   BACKUP_WAL_DIR           local WAL archive used as the first restore source
#   BACKUP_S3_BUCKET         fallback WAL source (restore_command fetches from S3)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
. "${SCRIPT_DIR}/lib/common.sh"

: "${PITR_DATA_DIR:=/var/lib/postgresql/pitr}"
: "${PITR_RECOVERY_ACTION:=promote}"

BASE_ARCHIVE="${1:-}"

restore_command_line() {
  if s3_enabled; then
    # Prefer the local archive; fall back to S3 for segments already pruned.
    printf 'mkdir -p %s && (cp %s/%%f %%p 2>/dev/null || aws s3 cp s3://%s/%s/wal/%%f %%p --region %s) && test -s %%p' \
      "${BACKUP_WAL_DIR}" "${BACKUP_WAL_DIR}" "${BACKUP_S3_BUCKET}" "${BACKUP_S3_PREFIX}" "${BACKUP_S3_REGION}"
  else
    printf 'test ! -f %s/%%f && cp %s/%%f %%p' "${BACKUP_WAL_DIR}" "${BACKUP_WAL_DIR}"
  fi
}

main() {
  [ -n "${BASE_ARCHIVE}" ] || die "usage: pitr-restore.sh <base-backup.tar.gz>"
  [ -f "${BASE_ARCHIVE}" ] || die "base backup not found: ${BASE_ARCHIVE}"
  require_cmd tar

  if [ -e "${PITR_DATA_DIR}" ] && [ -n "$(ls -A "${PITR_DATA_DIR}" 2>/dev/null)" ]; then
    die "PITR_DATA_DIR ${PITR_DATA_DIR} is not empty; refusing to overwrite"
  fi

  if [ -z "${PITR_TARGET_TIME:-}${PITR_TARGET_XID:-}${PITR_TARGET_NAME:-}" ]; then
    log "WARN: no recovery target set; recovery will replay to the end of the WAL archive"
  fi

  mkdir -p "${PITR_DATA_DIR}"
  log "Extracting base backup ${BASE_ARCHIVE} -> ${PITR_DATA_DIR}"
  # basebackup.sh archives the plain data directory (including streamed WAL in
  # pg_wal), so this is a directly restorable cluster directory.
  tar -xzf "${BASE_ARCHIVE}" -C "${PITR_DATA_DIR}"
  [ -f "${PITR_DATA_DIR}/PG_VERSION" ] || die "extracted archive is not a PostgreSQL data directory"

  log "Writing postgresql.auto.conf recovery settings"
  {
    printf "restore_command = '%s'\n" "$(restore_command_line)"
    printf "recovery_target_action = '%s'\n" "${PITR_RECOVERY_ACTION}"
    [ -n "${PITR_TARGET_TIME:-}" ] && printf "recovery_target_time = '%s'\n" "${PITR_TARGET_TIME}"
    [ -n "${PITR_TARGET_XID:-}" ] && printf "recovery_target_xid = '%s'\n" "${PITR_TARGET_XID}"
    [ -n "${PITR_TARGET_NAME:-}" ] && printf "recovery_target_name = '%s'\n" "${PITR_TARGET_NAME}"
  } >>"${PITR_DATA_DIR}/postgresql.auto.conf"

  # PostgreSQL 12+ uses a recovery.signal file instead of recovery.conf.
  touch "${PITR_DATA_DIR}/recovery.signal"
  chmod 700 "${PITR_DATA_DIR}"

  cat <<EOF
Point-in-time recovery staged.

  Data directory : ${PITR_DATA_DIR}
  Restore source : ${BACKUP_WAL_DIR}${BACKUP_S3_BUCKET:+ (+ s3://${BACKUP_S3_BUCKET}/${BACKUP_S3_PREFIX}/wal)}
  Target         : ${PITR_TARGET_TIME:-${PITR_TARGET_XID:-${PITR_TARGET_NAME:-end of WAL archive}}}

Start the rebuilt cluster, e.g.:

  pg_ctl -D ${PITR_DATA_DIR} -l ${PITR_DATA_DIR}/recovery.log start

Then verify, and promote it (or point the application at it) once the server has
replayed to the target and left recovery. See docs/emergency-restore-runbook.md.
EOF
}

main "$@"
