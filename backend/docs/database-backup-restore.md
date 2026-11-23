# Database backup and restore

This document describes how SkillSync backs up and restores its PostgreSQL
database, covering the automated schedules, retention, encryption, point-in-time
recovery (PITR), the verification process and the manual procedures.

For incident response, jump straight to the
[emergency restore runbook](./emergency-restore-runbook.md).

All tooling lives in [`backend/scripts/backup/`](../scripts/backup) and is driven
entirely by environment variables (see `.env.example`), so the same scripts run
from cron, systemd, a container sidecar or an operator's shell.

## Architecture

| Layer | Responsibility |
| --- | --- |
| [`backup.sh`](../scripts/backup/backup.sh) | Daily logical backup: `pg_dump` → verify → encrypt → upload → prune → record status → alert |
| [`basebackup.sh`](../scripts/backup/basebackup.sh) | Weekly physical base backup (`pg_basebackup`) used as the PITR starting point |
| [`wal-archive.sh`](../scripts/backup/wal-archive.sh) | PostgreSQL `archive_command`: continuously archives WAL segments for PITR |
| [`restore.sh`](../scripts/backup/restore.sh) | Manual logical restore from a backup |
| [`verify-restore.sh`](../scripts/backup/verify-restore.sh) | Monthly automated restore test into a throw-away database |
| [`pitr-restore.sh`](../scripts/backup/pitr-restore.sh) | Operator-driven point-in-time recovery |
| [`check-freshness.sh`](../scripts/backup/check-freshness.sh) | Hourly watchdog that alerts on stale/failed backups |
| `GET /admin/backups/status` | Admin API that reports health from the shared status file |

The daily logical backups and the WAL archive are independent: the logical
backups give you a portable, verifiable copy of the database, while the WAL
archive lets you replay to any point in time on top of a base backup. Offsite
retention (30 days) is enforced by an **S3 bucket lifecycle rule**, because
local pruning cannot delete objects that only exist in S3.

## Schedule

The backup sidecar in `docker-compose.yml` turns the following environment
variables into a crontab at start-up ([`entrypoint.sh`](../scripts/backup/entrypoint.sh)).
For bare-metal/VM deployments, install
[`scripts/backup/crontab`](../scripts/backup/crontab) with `crontab`.

| Job | Default | Variable |
| --- | --- | --- |
| Daily logical backup | `0 2 * * *` (02:00 daily) | `BACKUP_SCHEDULE_CRON` |
| Weekly physical base backup | `30 3 * * 0` (Sundays) | `BACKUP_BASE_SCHEDULE_CRON` |
| Monthly restore test | `0 4 1 * *` (1st of month) | `BACKUP_VERIFY_SCHEDULE_CRON` |
| Hourly freshness check | `0 * * * *` | `BACKUP_FRESHNESS_SCHEDULE_CRON` |

## Retention (30 days)

- **Local**: `backup.sh` prunes `skillsync-*.dump[.gpg]` files older than
  `BACKUP_RETENTION_DAYS` (default `30`) after every run.
- **Offsite (S3)**: create a lifecycle rule on the bucket prefix to expire
  objects after 30 days. Example (AWS CLI):

  ```bash
  aws s3api put-bucket-lifecycle-configuration \
    --bucket "$BACKUP_S3_BUCKET" \
    --lifecycle-configuration file://scripts/backup/s3-lifecycle.json
  ```

  [`s3-lifecycle.json`](../scripts/backup/s3-lifecycle.json) ships with the repo
  and expires `postgres/` after 30 days while aborting incomplete multipart
  uploads.

## Encryption

Backups are encrypted twice, at different layers:

1. **Client-side**: when `BACKUP_ENCRYPTION_ENABLED=true` (default), `backup.sh`
   encrypts the dump with GPG symmetric **AES-256** using
   `BACKUP_ENCRYPTION_PASSPHRASE` before it leaves the host. Artefacts land as
   `skillsync-<timestamp>.dump.gpg`. **Without the passphrase the backup cannot
   be restored** — store it in a secret manager and never commit it.
2. **Server-side**: objects uploaded to S3 use SSE (`BACKUP_S3_SSE`, default
   `aws:kms`; set `BACKUP_S3_KMS_KEY_ID` for a customer-managed key). WAL
   segments, which must stay byte-identical for `restore_command`, rely on this
   server-side encryption alone.

A `.sha256` sidecar is written next to every artefact to detect corruption.

## Point-in-time recovery (PITR)

1. `wal-archive.sh` is wired as the `archive_command` in `docker-compose.yml`
   (with `wal_level=replica`, `archive_mode=on`, `archive_timeout=300`). It
   copies each completed WAL segment to the shared archive and streams it to
   `s3://<bucket>/<prefix>/wal/`.
2. `basebackup.sh` takes a weekly physical base backup
   (`pg_basebackup --wal-method=stream`) to seed recovery.
3. [`pitr-restore.sh`](../scripts/backup/pitr-restore.sh) stages a rebuilt data
   directory from a base backup and writes `restore_command` +
   `recovery_target_time` (or `_xid`/`_name`) into `postgresql.auto.conf`.

See the [emergency restore runbook](./emergency-restore-runbook.md) for the
step-by-step PITR procedure.

## Verification: monthly restore test

Acceptance requires that backups are **proven restorable**, not merely written.
`verify-restore.sh` runs on the 1st of each month and:

1. downloads the newest offsite artefact (falling back to the newest local one);
2. verifies its `.sha256` checksum;
3. decrypts and validates the archive with `pg_restore --list`;
4. restores into a throw-away database (`VERIFY_DATABASE`, default
   `skillsync_verify`) that it drops afterwards;
5. asserts the `migrations` table exists and counts applied migrations;
6. alerts the webhook on any failure.

**Recording the result:** add a row to the table below after each run (or link
your ticketing system). A missed month is treated as a failed check.

| Month | Artefact verified | Result | Notes |
| --- | --- | --- | --- |
| _YYYY-MM_ | _skillsync-…dump.gpg_ | _pass/fail_ | |

The scratch database must exist and be reachable with the configured `PG*`
credentials:

```bash
psql -d "$PGDATABASE" -c 'CREATE DATABASE skillsync_verify;'
```

## Monitoring and alerts

`BACKUP_ALERT_WEBHOOK` receives a JSON payload (`{"text":"[SkillSync backup] …"}`)
on failures and, when `BACKUP_ALERT_ON_SUCCESS=true`, on successes. Alerts fire
from:

- `backup.sh` — any failure in dump/verify/encrypt/upload;
- `verify-restore.sh` — a failed monthly restore test;
- `wal-archive.sh` — WAL archiving failures PostgreSQL would otherwise only log;
- `check-freshness.sh` — hourly watchdog for a **stale** newest backup
  (`BACKUP_MAX_AGE_HOURS`, default `26`) or a **failed** last run. This catches
  the case a per-run alert cannot: a scheduler that stopped running entirely.

### Backup status endpoint

`GET /admin/backups/status` (admin JWT required) reads the JSON status file that
`backup.sh` writes and returns a `BackupStatusDto`:

```json
{
  "health": "healthy",
  "checkedAt": "2026-11-23T04:00:00.000Z",
  "lastBackup": {
    "status": "success",
    "startedAt": "2026-11-23T02:00:00.000Z",
    "finishedAt": "2026-11-23T02:03:12.000Z",
    "durationMs": 192000,
    "sizeBytes": 10485760,
    "encrypted": true,
    "uploadedToS3": true,
    "location": "s3://skillsync-backups/postgres/db/skillsync-….dump.gpg",
    "checksum": "sha256:…"
  },
  "lastBackupAgeHours": 1.95,
  "maxAgeHours": 26,
  "retentionDays": 30,
  "encryptionEnabled": true,
  "pointInTimeRecoveryEnabled": true,
  "storage": { "provider": "s3", "bucket": "skillsync-backups", "prefix": "postgres", "region": "us-east-1" }
}
```

`health` is one of `healthy`, `stale` (older than `maxAgeHours`), `failing` (last
run failed) or `not_configured` (no status file yet).

## Manual backup

Run a backup on demand (uses the same code path as the schedule):

```bash
cd backend
BACKUP_ENCRYPTION_PASSPHRASE='…' ./scripts/backup/backup.sh
```

Take a physical base backup (needed before a PITR restore):

```bash
BACKUP_ENCRYPTION_PASSPHRASE='…' ./scripts/backup/basebackup.sh
```

## Manual restore (logical)

Restore the newest local backup into a database of your choice:

```bash
cd backend
# Restore into a scratch database first — never overwrite production blind.
RESTORE_DATABASE=skillsync_restore \
BACKUP_ENCRYPTION_PASSPHRASE='…' \
  ./scripts/backup/restore.sh
```

Restore a specific artefact (local path or a file you downloaded from S3):

```bash
RESTORE_DATABASE=skillsync_restore \
BACKUP_ENCRYPTION_PASSPHRASE='…' \
  ./scripts/backup/restore.sh /var/lib/skillsync/backups/skillsync-2026-11-23T02-00-00Z.dump.gpg
```

`restore.sh` handles decryption, validates the archive and restores with
`pg_restore --exit-on-error`. Set `RESTORE_CLEAN=true` only when you intend to
drop existing objects first. For a full production cutover, follow the
[emergency restore runbook](./emergency-restore-runbook.md).

## Restoring from S3

```bash
aws s3 cp "s3://$BACKUP_S3_BUCKET/$BACKUP_S3_PREFIX/db/<artefact>.dump.gpg" . \
  --region "$BACKUP_S3_REGION"
aws s3 cp "s3://$BACKUP_S3_BUCKET/$BACKUP_S3_PREFIX/db/<artefact>.dump.gpg.sha256" . \
  --region "$BACKUP_S3_REGION"
sha256sum -c <artefact>.dump.gpg.sha256
RESTORE_DATABASE=skillsync_restore BACKUP_ENCRYPTION_PASSPHRASE='…' \
  ./scripts/backup/restore.sh ./<artefact>.dump.gpg
```

## Related documents

- [Emergency restore runbook](./emergency-restore-runbook.md)
- [Testing guide](./testing.md)
- [Database indexing](./database-indexing.md)
