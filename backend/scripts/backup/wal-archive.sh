#!/usr/bin/env bash
#
# PostgreSQL `archive_command` for continuous WAL archiving / point-in-time
# recovery (issue #1714).
#
# PostgreSQL invokes this with two arguments, e.g.:
#   archive_command = '/path/to/wal-archive.sh %p %f'
#
# where %p is the absolute path to the completed WAL segment in pg_wal and %f is
# its file name. The script copies the segment into the local WAL archive and,
# when a bucket is configured, streams it to S3. PostgreSQL retries whenever the
# command exits non-zero, so any failure is surfaced to the server log and to
# the alert webhook.
#
# WAL segments are encrypted at rest with S3 SSE-KMS rather than GPG: encrypting
# them would break the standard `restore_command` used during PITR, which must
# hand PostgreSQL a byte-identical segment.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
. "${SCRIPT_DIR}/lib/common.sh"

WAL_PATH="${1:-}"
WAL_NAME="${2:-}"

on_exit() {
  local code=$?
  if [ "$code" -ne 0 ]; then
    notify_failure "WAL archiving failed for ${WAL_NAME:-unknown segment}"
  fi
  exit "$code"
}
trap on_exit EXIT

main() {
  [ -n "${WAL_PATH}" ] && [ -n "${WAL_NAME}" ] \
    || die "usage: wal-archive.sh <pg_wal path> <wal file name>"
  [ -f "${WAL_PATH}" ] || die "WAL segment not found: ${WAL_PATH}"

  require_cmd sha256sum
  s3_enabled && require_cmd aws

  mkdir -p "${BACKUP_WAL_DIR}"

  # Atomic local copy: a partially-written segment must never appear complete to
  # a future restore, so archive to a temp name first and rename on success.
  local dest="${BACKUP_WAL_DIR}/${WAL_NAME}"
  cp "${WAL_PATH}" "${dest}.tmp"
  mv "${dest}.tmp" "${dest}"
  log "Archived WAL segment locally: ${dest}"

  if s3_enabled; then
    local key="wal/${WAL_NAME}"
    s3_upload "${dest}" "${key}"
    log "Uploaded WAL segment to $(s3_uri "${key}")"
  fi
}

main "$@"
