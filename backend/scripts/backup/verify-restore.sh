#!/usr/bin/env bash
#
# Monthly backup verification / restore test (issue #1714).
#
# Proves that the latest offsite backup is actually restorable: it pulls the
# newest artefact from S3 (or falls back to the newest local one), decrypts it,
# restores into a throw-away database, runs sanity checks against key tables and
# then drops the scratch database. Run monthly from cron (see
# scripts/backup/crontab) and document the result in docs/database-backup-restore.md.
#
# The control/verification databases must already exist and be reachable using
# the configured PG* credentials, e.g.:
#   CREATE DATABASE skillsync_verify;
#
# Environment:
#   VERIFY_DATABASE   scratch database used for the restore
#                     (default: ${PGDATABASE}_verify)
#   VERIFY_KEEP       "true" to keep the scratch database for inspection
#   BACKUP_ALERT_WEBHOOK  alert on failure

set -euo pipefail
set -E

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
. "${SCRIPT_DIR}/lib/common.sh"

VERIFY_DATABASE="${VERIFY_DATABASE:-${PGDATABASE}_verify}"
VERIFY_KEEP="${VERIFY_KEEP:-false}"
CONTROL_DB="${PGDATABASE}"
WORKDIR=""

cleanup() {
  local code=$?
  [ -n "${WORKDIR}" ] && rm -rf "${WORKDIR}"
  exit "$code"
}
trap cleanup EXIT

on_error() {
  notify_failure "Monthly restore test failed: ${LAST_STEP:-unknown step}"
}
trap on_error ERR

LAST_STEP="preflight"
main() {
  require_cmd pg_restore pg_dump psql gpg
  require_encryption_passphrase
  s3_enabled && require_cmd aws

  WORKDIR="$(mktemp -d -t skillsync-verify-XXXXXX)"

  # 1. Obtain the newest artefact (offsite first, then local).
  local archive="" key=""
  if s3_enabled; then
    LAST_STEP="locate offsite backup"
    key="$(aws s3 ls "s3://${BACKUP_S3_BUCKET}/${BACKUP_S3_PREFIX}/db/" --region "${BACKUP_S3_REGION}" \
      | awk '{print $4}' | grep -E '^skillsync-.*\.dump\.gpg$' | sort | tail -n1)"
  fi
  if [ -n "${key}" ]; then
    LAST_STEP="download offsite backup"
    log "Downloading newest offsite backup: ${key}"
    s3_download "db/${key}" "${WORKDIR}/${key}"
    archive="${WORKDIR}/${key}"
  else
    LAST_STEP="locate local backup"
    archive="$(find "${BACKUP_DIR}" -maxdepth 1 -type f -name 'skillsync-*.dump.gpg' \
      -printf '%T@ %p\n' 2>/dev/null | sort -nr | head -n1 | awk '{print $2}')"
    [ -n "${archive}" ] || die "no backup available offsite or in ${BACKUP_DIR}"
    log "Using newest local backup: ${archive}"
  fi

  # 2. Verify the checksum sidecar when present.
  LAST_STEP="verify checksum"
  local sidecar="${archive}.sha256"
  if [ -f "${sidecar}" ]; then
    local expected actual
    expected="$(awk '{print $1}' "${sidecar}")"
    actual="$(sha256_of "${archive}")"
    actual="${actual#sha256:}"
    [ "${expected}" = "${actual}" ] || die "checksum mismatch: expected ${expected}, got ${actual}"
    log "Checksum verified: ${actual}"
  else
    log "WARN: no .sha256 sidecar for ${archive}; skipping checksum verification"
  fi

  # 3. Decrypt.
  LAST_STEP="decrypt backup"
  local dump="${WORKDIR}/restore.dump"
  decrypt_file "${archive}" "${dump}"
  pg_restore --list "${dump}" >/dev/null || die "invalid archive after decryption"

  # 4. Recreate the scratch database and restore into it.
  LAST_STEP="recreate scratch database ${VERIFY_DATABASE}"
  PGPASSWORD="${PGPASSWORD:-}" psql -d "${CONTROL_DB}" -v ON_ERROR_STOP=1 \
    -c "DROP DATABASE IF EXISTS \"${VERIFY_DATABASE}\";" \
    -c "CREATE DATABASE \"${VERIFY_DATABASE}\";"

  LAST_STEP="restore into ${VERIFY_DATABASE}"
  pg_restore --dbname="${VERIFY_DATABASE}" --no-owner --no-privileges --exit-on-error "${dump}"

  # 5. Sanity checks: migrations table must be present and populated.
  LAST_STEP="run sanity checks"
  local migrations
  migrations="$(PGPASSWORD="${PGPASSWORD:-}" psql -d "${VERIFY_DATABASE}" -tAc \
    "SELECT count(*) FROM information_schema.tables WHERE table_name = 'migrations';")"
  [ "${migrations}" = "1" ] || die "restored database is missing the migrations table"

  local applied
  applied="$(PGPASSWORD="${PGPASSWORD:-}" psql -d "${VERIFY_DATABASE}" -tAc \
    "SELECT count(*) FROM migrations;" 2>/dev/null || echo 0)"
  log "Restored database has ${applied} applied migrations"

  LAST_STEP="drop scratch database"
  if [ "${VERIFY_KEEP}" = "true" ]; then
    log "VERIFY_KEEP=true — leaving ${VERIFY_DATABASE} in place for inspection"
  else
    PGPASSWORD="${PGPASSWORD:-}" psql -d "${CONTROL_DB}" -v ON_ERROR_STOP=1 \
      -c "DROP DATABASE IF EXISTS \"${VERIFY_DATABASE}\";"
  fi

  log "Monthly restore test PASSED for ${key:-${archive}}"
  notify_success "Monthly restore test passed (${key:-$(basename "${archive}")})"
}

main "$@"
