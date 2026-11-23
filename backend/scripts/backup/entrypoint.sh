#!/usr/bin/env bash
#
# Entrypoint for the backup sidecar (issue #1714). Turns the schedule
# environment variables into a crontab and keeps crond in the foreground so the
# container restarts if the scheduler dies.
#
# Schedule variables (standard cron syntax):
#   BACKUP_SCHEDULE_CRON          daily logical backup      (default 0 2 * * *)
#   BACKUP_BASE_SCHEDULE_CRON     weekly physical base bk   (default 30 3 * * 0)
#   BACKUP_VERIFY_SCHEDULE_CRON   monthly restore test      (default 0 4 1 * *)
#   BACKUP_FRESHNESS_SCHEDULE_CRON hourly freshness probe   (default 0 * * * *)

set -euo pipefail

: "${BACKUP_SCHEDULE_CRON:=0 2 * * *}"
: "${BACKUP_BASE_SCHEDULE_CRON:=30 3 * * 0}"
: "${BACKUP_VERIFY_SCHEDULE_CRON:=0 4 1 * *}"
: "${BACKUP_FRESHNESS_SCHEDULE_CRON:=0 * * * *}"

BIN=/opt/skillsync/scripts/backup
LOG_DIR=/var/log/skillsync
ENV_FILE=/etc/skillsync/backup.env
mkdir -p "${LOG_DIR}" "$(dirname "${ENV_FILE}")"

# crond does not inherit the container environment, so persist the PG*/BACKUP_*/
# AWS_* variables to a file the jobs source. `printf %q` shell-escapes each value
# (passphrases with spaces/quotes survive intact); the file is read by bash.
{
  printf 'set -a\n'
  while IFS='=' read -r key value; do
    case "${key}" in
      PG* | BACKUP_* | AWS_* | TZ | PATH) printf '%s=%q\n' "${key}" "${value}" ;;
    esac
  done < <(env)
  printf 'set +a\n'
} >"${ENV_FILE}"
chmod 600 "${ENV_FILE}"

CRON_FILE=/etc/crontabs/root
{
  printf "%s bash -c '. %s && exec %s/backup.sh' >> %s/backup.log 2>&1\n" \
    "${BACKUP_SCHEDULE_CRON}" "${ENV_FILE}" "${BIN}" "${LOG_DIR}"
  printf "%s bash -c '. %s && exec %s/basebackup.sh' >> %s/backup.log 2>&1\n" \
    "${BACKUP_BASE_SCHEDULE_CRON}" "${ENV_FILE}" "${BIN}" "${LOG_DIR}"
  printf "%s bash -c '. %s && exec %s/verify-restore.sh' >> %s/verify.log 2>&1\n" \
    "${BACKUP_VERIFY_SCHEDULE_CRON}" "${ENV_FILE}" "${BIN}" "${LOG_DIR}"
  printf "%s bash -c '. %s && exec %s/check-freshness.sh' >> %s/backup.log 2>&1\n" \
    "${BACKUP_FRESHNESS_SCHEDULE_CRON}" "${ENV_FILE}" "${BIN}" "${LOG_DIR}"
} >"${CRON_FILE}"

echo "[backup] installed schedule:"
sed 's/^/  /' "${CRON_FILE}"

# busybox crond reads /etc/crontabs/root and stays in the foreground with -f.
exec crond -f -l 8
