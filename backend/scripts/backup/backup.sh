#!/usr/bin/env bash
#
# Daily logical PostgreSQL backup: pg_dump -> verify -> encrypt -> upload to S3
# -> prune -> record status. Run from cron/systemd (see scripts/backup/crontab)
# or a container sidecar.
#
# Exit status is 0 only when the dump was written, verified, encrypted (when
# enabled) and uploaded (when a bucket is configured). Any failure records a
# `failed` status and fires the alert webhook.

set -euo pipefail
set -E

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
. "${SCRIPT_DIR}/lib/common.sh"

STARTED_AT=""
STARTED_MS="0"
ARTEFACT=""
ENCRYPTED="false"
UPLOADED="false"
LOCATION=""
SIZE=""
CHECKSUM=""
DURATION_MS="null"
ERROR=""
STATUS_WRITTEN="false"

json_field() {
  # json_field <value> — emits a JSON string or null for an empty value.
  if [ -z "$1" ]; then printf 'null'; else printf '"%s"' "$1"; fi
}

finish() {
  # finish <success|failed> — writes the machine-readable status exactly once.
  local status="$1"
  [ "${STATUS_WRITTEN}" = "true" ] && return 0
  STATUS_WRITTEN="true"

  local finished_at
  finished_at="$(iso_now)"
  write_status "$(printf '{"status":"%s","startedAt":"%s","finishedAt":"%s","durationMs":%s,"sizeBytes":%s,"encrypted":%s,"uploadedToS3":%s,"location":%s,"checksum":%s,"error":%s}' \
    "${status}" \
    "${STARTED_AT}" \
    "${finished_at}" \
    "${DURATION_MS}" \
    "$(json_field "${SIZE}")" \
    "${ENCRYPTED}" \
    "${UPLOADED}" \
    "$(json_field "${LOCATION}")" \
    "$(json_field "${CHECKSUM}")" \
    "$(json_field "${ERROR}")")"
}

on_exit() {
  local code=$?
  if [ "$code" -ne 0 ]; then
    ERROR="${ERROR:-backup failed with exit code ${code}}"
    DURATION_MS="$(( $(epoch_ms) - STARTED_MS ))"
    finish "failed"
    notify_failure "Daily backup failed: ${ERROR}"
  fi
  exit "$code"
}

trap 'ERROR="command failed at line ${LINENO}"' ERR
trap on_exit EXIT

main() {
  require_cmd pg_dump pg_restore sha256sum find
  require_encryption_passphrase
  s3_enabled && require_cmd aws
  [ "${BACKUP_ENCRYPTION_ENABLED}" = "true" ] && require_cmd gpg

  mkdir -p "${BACKUP_DIR}"
  STARTED_AT="$(iso_now)"
  STARTED_MS="$(epoch_ms)"

  local stamp file
  stamp="$(date -u +%Y-%m-%dT%H-%M-%SZ)"
  file="${BACKUP_DIR}/skillsync-${stamp}.dump"

  log "Starting logical backup of ${PGDATABASE}@${PGHOST}:${PGPORT}"
  pg_dump --format=custom --no-owner --no-privileges --file="${file}"

  # A corrupt or truncated dump fails here, before it is shipped anywhere.
  pg_restore --list "${file}" >/dev/null
  log "Dump written and verified: ${file}"

  ARTEFACT="${file}"
  if [ "${BACKUP_ENCRYPTION_ENABLED}" = "true" ]; then
    encrypt_file "${file}"
    ARTEFACT="${file}.gpg"
    ENCRYPTED="true"
    log "Encrypted with AES-256: ${ARTEFACT}"
  fi

  CHECKSUM="$(sha256_of "${ARTEFACT}")"
  SIZE="$(file_size "${ARTEFACT}")"
  # Sidecar is in `sha256sum -c` format (raw hex), unlike the "sha256:"-prefixed
  # value recorded in the status file.
  printf '%s  %s\n' "${CHECKSUM#sha256:}" "$(basename "${ARTEFACT}")" >"${ARTEFACT}.sha256"

  if s3_enabled; then
    local key
    key="db/$(basename "${ARTEFACT}")"
    log "Uploading to $(s3_uri "${key}")"
    s3_upload "${ARTEFACT}" "${key}"
    s3_upload "${ARTEFACT}.sha256" "${key}.sha256"
    UPLOADED="true"
    LOCATION="$(s3_uri "${key}")"
  else
    log "BACKUP_S3_BUCKET is unset; keeping the artefact local only"
  fi

  prune_local

  DURATION_MS="$(( $(epoch_ms) - STARTED_MS ))"
  finish "success"
  log "Backup complete in ${DURATION_MS} ms (${SIZE} bytes, ${CHECKSUM})"
  notify_success "Daily backup succeeded (${SIZE} bytes) -> ${LOCATION:-${ARTEFACT}}"
}

main "$@"
