#!/usr/bin/env bash
#
# Shared helpers for the SkillSync PostgreSQL backup tooling (issue #1714).
#
# Sourced by backup.sh, restore.sh, verify-restore.sh, wal-archive.sh and
# pitr-restore.sh. Everything is driven by environment variables so the same
# scripts run unchanged from cron, systemd, a container sidecar or an
# operator's shell.

# shellcheck shell=bash

set -euo pipefail

# ── Defaults (override through the environment) ──────────────────────────────
: "${BACKUP_DIR:=/var/lib/skillsync/backups}"
: "${BACKUP_WAL_DIR:=/var/lib/skillsync/wal-archive}"
: "${BACKUP_RETENTION_DAYS:=30}"
: "${BACKUP_MAX_AGE_HOURS:=26}"
: "${BACKUP_ENCRYPTION_ENABLED:=true}"
: "${BACKUP_ENCRYPTION_PASSPHRASE:=}"
: "${BACKUP_S3_BUCKET:=}"
: "${BACKUP_S3_PREFIX:=postgres}"
: "${BACKUP_S3_REGION:=us-east-1}"
: "${BACKUP_S3_STORAGE_CLASS:=STANDARD_IA}"
# SSE-KMS keeps WAL segments and any non-encrypted object encrypted at rest.
: "${BACKUP_S3_SSE:=aws:kms}"
: "${BACKUP_S3_KMS_KEY_ID:=}"
: "${BACKUP_STATUS_FILE:=${BACKUP_DIR}/backup-status.json}"
: "${BACKUP_ALERT_WEBHOOK:=}"
: "${BACKUP_ALERT_ON_SUCCESS:=false}"

: "${PGHOST:=localhost}"
: "${PGPORT:=5432}"
: "${PGUSER:=postgres}"
: "${PGDATABASE:=skillsync}"

export PGHOST PGPORT PGUSER PGDATABASE
[ -n "${PGPASSWORD:-}" ] && export PGPASSWORD

# ── Logging ──────────────────────────────────────────────────────────────────
log() {
  printf '%s [backup] %s\n' "$(date -u +%Y-%m-%dT%H:%M:%SZ)" "$*" >&2
}

die() {
  log "ERROR: $*"
  exit 1
}

require_cmd() {
  for cmd in "$@"; do
    command -v "$cmd" >/dev/null 2>&1 || die "required command not found: $cmd"
  done
}

# ── Feature probes ───────────────────────────────────────────────────────────
s3_enabled() {
  [ -n "${BACKUP_S3_BUCKET}" ]
}

require_encryption_passphrase() {
  if [ "${BACKUP_ENCRYPTION_ENABLED}" = "true" ] && [ -z "${BACKUP_ENCRYPTION_PASSPHRASE}" ]; then
    die "BACKUP_ENCRYPTION_PASSPHRASE must be set when BACKUP_ENCRYPTION_ENABLED=true"
  fi
}

# ── Encryption (GPG symmetric, AES-256) ──────────────────────────────────────
encrypt_file() {
  # Encrypts <file> to <file>.gpg and removes the plaintext copy.
  local file="$1"
  gpg --batch --yes --symmetric --cipher-algo AES256 \
    --passphrase-fd 3 \
    --output "${file}.gpg" "$file" 3<<<"${BACKUP_ENCRYPTION_PASSPHRASE}" \
    || die "gpg encryption failed for ${file}"
  rm -f "$file"
}

decrypt_file() {
  # Decrypts <file> to the explicit output path.
  local file="$1" out="$2"
  gpg --batch --yes --decrypt \
    --passphrase-fd 3 \
    --output "$out" "$file" 3<<<"${BACKUP_ENCRYPTION_PASSPHRASE}" \
    || die "gpg decryption failed for ${file}"
}

sha256_of() {
  sha256sum "$1" | awk '{print "sha256:" $1}'
}

file_size() {
  stat -c '%s' "$1" 2>/dev/null || stat -f '%z' "$1"
}

# ── Offsite storage ──────────────────────────────────────────────────────────
s3_uri() {
  printf 's3://%s/%s/%s' "${BACKUP_S3_BUCKET}" "${BACKUP_S3_PREFIX}" "$1"
}

s3_upload() {
  # s3_upload <local-file> <key-relative-to-prefix>
  local file="$1" key="$2" args
  args=(--region "${BACKUP_S3_REGION}" --storage-class "${BACKUP_S3_STORAGE_CLASS}")
  [ -n "${BACKUP_S3_SSE}" ] && args+=(--sse "${BACKUP_S3_SSE}")
  [ -n "${BACKUP_S3_KMS_KEY_ID}" ] && args+=(--sse-kms-key-id "${BACKUP_S3_KMS_KEY_ID}")
  aws s3 cp "$file" "$(s3_uri "$key")" "${args[@]}"
}

s3_download() {
  # s3_download <key-relative-to-prefix> <destination>
  aws s3 cp "$(s3_uri "$1")" "$2" --region "${BACKUP_S3_REGION}"
}

# ── Retention ────────────────────────────────────────────────────────────────
prune_local() {
  # Removes local artefacts older than the retention window. Offsite retention
  # is enforced by the S3 bucket lifecycle rule (see docs/database-backup-restore.md).
  log "Pruning local artefacts older than ${BACKUP_RETENTION_DAYS} days in ${BACKUP_DIR}"
  find "${BACKUP_DIR}" -maxdepth 1 -type f \
    \( -name 'skillsync-*.dump' -o -name 'skillsync-*.dump.gpg' \) \
    -mtime "+${BACKUP_RETENTION_DAYS}" -print -delete || true
}

# ── Alerting ─────────────────────────────────────────────────────────────────
notify() {
  # notify <level> <message> — always logs; posts to the webhook when configured.
  local level="$1" message="$2"
  log "${level}: ${message}"
  [ -n "${BACKUP_ALERT_WEBHOOK}" ] || return 0
  command -v curl >/dev/null 2>&1 || {
    log "WARN: curl unavailable, cannot deliver alert"
    return 0
  }
  local payload
  payload="$(printf '{"text":"[SkillSync backup] %s: %s"}' "${level}" "${message}")"
  curl -fsS -m 10 -X POST "${BACKUP_ALERT_WEBHOOK}" \
    -H 'Content-Type: application/json' -d "${payload}" >/dev/null \
    || log "WARN: failed to deliver alert webhook"
}

notify_failure() {
  notify "FAILURE" "$*"
}

notify_success() {
  # Only alert on success when explicitly requested (avoids alert fatigue).
  [ "${BACKUP_ALERT_ON_SUCCESS}" = "true" ] && notify "SUCCESS" "$*"
  return 0
}

# ── Status file (read by GET /admin/backups/status) ──────────────────────────
write_status() {
  # write_status <json-string>
  mkdir -p "$(dirname "${BACKUP_STATUS_FILE}")"
  printf '%s\n' "$1" >"${BACKUP_STATUS_FILE}.tmp"
  mv "${BACKUP_STATUS_FILE}.tmp" "${BACKUP_STATUS_FILE}"
}

iso_now() {
  date -u +%Y-%m-%dT%H:%M:%S.000Z
}

epoch_ms() {
  date +%s%3N
}
