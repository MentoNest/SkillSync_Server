#!/usr/bin/env bash
#
# Backup freshness watchdog (issue #1714).
#
# Reads the status file written by backup.sh and fires the alert webhook when the
# newest backup is older than BACKUP_MAX_AGE_HOURS or the last run failed. This
# catches the failure mode a per-run alert cannot: a job that stops running
# entirely (scheduler down, image not deployed, etc.). Run hourly from cron.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=lib/common.sh
. "${SCRIPT_DIR}/lib/common.sh"

# Parses the ISO-8601 timestamp from a JSON field, e.g. "finishedAt":"...".
json_field() {
  # json_field <json> <key>
  printf '%s' "$1" | sed -n "s/.*\"$2\":\"\\([^\"]*\\)\".*/\\1/p"
}

to_epoch() {
  # to_epoch <ISO-8601> — GNU date; falls back to BSD date for local testing.
  date -u -d "$1" +%s 2>/dev/null || date -u -j -f '%Y-%m-%dT%H:%M:%S.000Z' "$1" +%s
}

main() {
  if [ ! -f "${BACKUP_STATUS_FILE}" ]; then
    notify_failure "Backup status file not found at ${BACKUP_STATUS_FILE}; no backup has ever run"
    exit 1
  fi

  local json status finished age
  json="$(cat "${BACKUP_STATUS_FILE}")"
  status="$(printf '%s' "${json}" | sed -n 's/.*"status":"\([^"]*\)".*/\1/p')"
  finished="$(json_field "${json}" "finishedAt")"

  if [ "${status}" = "failed" ]; then
    notify_failure "Last backup run failed (see ${BACKUP_STATUS_FILE})"
    exit 1
  fi

  if [ -z "${finished}" ]; then
    notify_failure "Backup status file has no finishedAt timestamp"
    exit 1
  fi

  age="$(( ( $(date -u +%s) - $(to_epoch "${finished}") ) / 3600 ))"
  if [ "${age}" -gt "${BACKUP_MAX_AGE_HOURS}" ]; then
    notify_failure "Newest backup is ${age}h old (threshold ${BACKUP_MAX_AGE_HOURS}h)"
    exit 1
  fi

  log "Backup is fresh (${age}h old, status=${status})"
}

main "$@"
