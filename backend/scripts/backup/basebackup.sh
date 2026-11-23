#!/usr/bin/env bash
#
# Physical base backup for point-in-time recovery (issue #1714).
#
# Takes a `pg_basebackup` of the running cluster and ships it, together with the
# WAL segments archived by wal-archive.sh, so the cluster can be replayed to any
# point in time with pitr-restore.sh. Run it alongside the daily logical backup
# (e.g. weekly) from cron.
#
# Environment:
#   BACKUP_BASE_DIR   where base backups are written (default: ${BACKUP_DIR}/base)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
. "${SCRIPT_DIR}/lib/common.sh"

: "${BACKUP_BASE_DIR:=${BACKUP_DIR}/base}"

main() {
  require_cmd pg_basebackup tar gzip
  s3_enabled && require_cmd aws

  mkdir -p "${BACKUP_BASE_DIR}"

  local stamp file tmpdir
  stamp="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
  file="${BACKUP_BASE_DIR}/base-${stamp}.tar.gz"
  tmpdir="$(mktemp -d -t skillsync-base-XXXXXX)"
  # shellcheck disable=SC2064
  trap "rm -rf '${tmpdir}'" EXIT

  log "Taking physical base backup of ${PGDATABASE}@${PGHOST}:${PGPORT}"
  # -X stream bundles the WAL needed to make the base backup consistent, so the
  # extracted data directory is a valid PITR starting point.
  pg_basebackup -h "${PGHOST}" -p "${PGPORT}" -U "${PGUSER}" \
    --pgdata="${tmpdir}" --wal-method=stream --checkpoint=fast \
    --progress --verbose

  tar -czf "${file}" -C "${tmpdir}" .
  [ -s "${file}" ] || die "base backup is empty: ${file}"

  local checksum size
  checksum="$(sha256_of "${file}")"
  size="$(file_size "${file}")"
  printf '%s  %s\n' "${checksum#sha256:}" "$(basename "${file}")" >"${file}.sha256"

  if s3_enabled; then
    local key="base/$(basename "${file}")"
    log "Uploading base backup to $(s3_uri "${key}")"
    s3_upload "${file}" "${key}"
    s3_upload "${file}.sha256" "${key}.sha256"
  fi

  log "Base backup complete (${size} bytes, ${checksum})"
}

main "$@"
