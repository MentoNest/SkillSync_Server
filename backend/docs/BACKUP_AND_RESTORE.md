# Database backup and restore

PostgreSQL is backed up daily, encrypted, and kept for 30 days. A monthly drill
proves the backups restore.

## What runs

| Requirement | How |
|-------------|-----|
| Daily backups | `scripts/backup/pg-backup.sh` from cron (below) |
| 30-day retention | local `find -mtime +30` prune, plus an S3 lifecycle rule (expire `daily/` after 30 days) |
| Encryption | `openssl enc -aes-256-cbc -pbkdf2` with `BACKUP_ENCRYPTION_PASSPHRASE`; S3 objects also use `--sse AES256` |
| Failure alerts | the script posts to `BACKUP_ALERT_WEBHOOK` (Slack-compatible) and writes `status: failed` |
| Status for admins | `GET /admin/backups/status` reads `BACKUP_STATUS_FILE` |
| Monthly restore test | `scripts/backup/verify-restore.sh` |
| Point-in-time recovery | WAL archiving, below |

## Cron

```cron
15 2 * * *  cd /app/backend && ./scripts/backup/pg-backup.sh >> /var/log/skillsync-backup.log 2>&1
30 3 1 * *  cd /app/backend && ./scripts/backup/verify-restore.sh >> /var/log/skillsync-restore-test.log 2>&1
```

Environment: `DATABASE_URL`, `BACKUP_ENCRYPTION_PASSPHRASE`, `BACKUP_S3_BUCKET`,
optional `BACKUP_DIR`, `BACKUP_RETENTION_DAYS`, `BACKUP_STATUS_FILE`,
`BACKUP_ALERT_WEBHOOK`. Store the passphrase in a secrets manager, never in the
repository, and keep a copy offline - without it the backups are unreadable.

## Point-in-time recovery (WAL archiving)

In `postgresql.conf` on the database server:

```conf
wal_level = replica
archive_mode = on
archive_command = 'aws s3 cp %p s3://<bucket>/wal/%f --sse AES256'
archive_timeout = 300
```

Take a base backup with `pg_basebackup`, then recover to a moment in time by
restoring it and setting `restore_command = 'aws s3 cp s3://<bucket>/wal/%f %p'`
and `recovery_target_time = '2025-01-31 12:00:00 UTC'` in `postgresql.auto.conf`
with an empty `recovery.signal` file.

## Manual backup

```bash
./scripts/backup/pg-backup.sh
```

## Manual restore

```bash
export BACKUP_ENCRYPTION_PASSPHRASE=...
./scripts/backup/pg-restore.sh /var/backups/skillsync/skillsync-<stamp>.dump.enc "$TARGET_DATABASE_URL"
```

`--clean` drops existing objects in the target. Restore into a scratch database
first when you are only inspecting data.

## Emergency restore runbook

1. Declare the incident; stop writes (scale the API to 0 or point traffic at a maintenance page).
2. Pick the backup: newest `status.json` with `"status":"ok"`, or the last good one before the damage.
3. Restore into a new database with `pg-restore.sh`; for point-in-time, follow the WAL section.
4. Run `npm run migration:run` against it, then smoke-test `GET /health` and a login.
5. Switch `DATABASE_URL` to the restored database and restart the API.
6. Record the timeline and what was lost; fix the cause before re-enabling traffic.

## Monthly restore test

`verify-restore.sh` restores the newest backup into a throw-away database,
queries `users`, and drops it. A failure should page the on-call engineer; a
backup that cannot be restored counts as a failed backup. Log each drill in the
team's operations journal.
