# Emergency restore runbook

Use this runbook when production data is lost or corrupted and the database must
be brought back. It is written to be followed under pressure: each phase states
the goal, the command and the check that proves the step worked.

**Companion document:** [database-backup-restore.md](./database-backup-restore.md).

## 0. Roles and first actions

| Role | Responsibility |
| --- | --- |
| Incident commander | Decides logical vs. PITR, owns the timeline |
| DBA / on-call engineer | Runs the commands below |
| Comms | Notifies stakeholders; opens the incident channel |

Immediately:

1. **Stop writes** to prevent further damage:

   ```bash
   # Scale the API down so nothing writes while you work.
   docker compose stop backend
   ```

2. **Announce** the incident and record the UTC time it started — you will need
   it in step 3 to pick a recovery target.

3. **Do not delete anything.** Keep the broken cluster (and its `pgdata` volume)
   untouched until the incident is closed; it may be needed for forensics.

## 1. Choose the recovery path

| Situation | Path |
| --- | --- |
| Table/row-level damage, "recent" good state is acceptable | **A. Logical restore** |
| Need an exact moment (e.g. "just before a bad migration/deploy") | **B. Point-in-time recovery** |
| Entire cluster/host lost | **B. Point-in-time recovery** (or A if no WAL base exists) |

If in doubt, prefer **B** — it restores to a precise moment rather than to
02:00 of the last daily backup.

## 2. Gather artefacts

```bash
export BACKUP_S3_BUCKET=… BACKUP_S3_PREFIX=postgres BACKUP_S3_REGION=us-east-1

# Daily logical backups:
aws s3 ls "s3://$BACKUP_S3_BUCKET/$BACKUP_S3_PREFIX/db/" --region "$BACKUP_S3_REGION" | tail

# Physical base backups (PITR starting points):
aws s3 ls "s3://$BACKUP_S3_BUCKET/$BACKUP_S3_PREFIX/base/" --region "$BACKUP_S3_REGION" | tail

# WAL segments available for replay:
aws s3 ls "s3://$BACKUP_S3_BUCKET/$BACKUP_S3_PREFIX/wal/" --region "$BACKUP_S3_REGION" | tail
```

You need `BACKUP_ENCRYPTION_PASSPHRASE` from the secret manager. If it is
unavailable, logical backups **cannot** be decrypted (WAL segments are
server-side encrypted and are unaffected by this passphrase).

## Path A — Logical restore

Use this to restore the database from a daily `.dump.gpg` artefact.

### A1. Download and verify

```bash
ART=skillsync-2026-11-23T02-00-00Z.dump.gpg      # pick from step 2
aws s3 cp "s3://$BACKUP_S3_BUCKET/$BACKUP_S3_PREFIX/db/$ART" . --region "$BACKUP_S3_REGION"
aws s3 cp "s3://$BACKUP_S3_BUCKET/$BACKUP_S3_PREFIX/db/$ART.sha256" . --region "$BACKUP_S3_REGION"
sha256sum -c "$ART.sha256"                        # MUST print: OK
```

If the checksum fails, pick the next-newest artefact; do **not** continue.

### A2. Restore into a scratch database first

```bash
cd backend
RESTORE_DATABASE=skillsync_recovery \
BACKUP_ENCRYPTION_PASSPHRASE=… \
  ./scripts/backup/restore.sh ./"$ART"
```

### A3. Validate the restored data

```bash
psql -d skillsync_recovery -c "SELECT count(*) FROM migrations;"
psql -d skillsync_recovery -c "SELECT count(*) FROM users;"
```

Confirm row counts and spot-check critical tables against expectations.

### A4. Cut over

Once validated, restore into the live database (this is destructive):

```bash
RESTORE_DATABASE=skillsync RESTORE_CLEAN=true \
BACKUP_ENCRYPTION_PASSPHRASE=… \
  ./scripts/backup/restore.sh ./"$ART"

docker compose start backend
```

Continue to **phase 4 (verify)**.

## Path B — Point-in-time recovery (PITR)

Use this to replay a physical base backup plus WAL to a chosen moment.

### B1. Select the recovery target

Set the target to **just before** the damage in UTC, e.g. the moment before a bad
deploy:

```
RECOVERY_TARGET="2026-11-23T09:29:00+00"
```

### B2. Download the base backup

```bash
BASE=base-2026-11-22T03-30-00Z.tar.gz            # pick from step 2
aws s3 cp "s3://$BACKUP_S3_BUCKET/$BACKUP_S3_PREFIX/base/$BASE" . --region "$BACKUP_S3_REGION"
aws s3 cp "s3://$BACKUP_S3_BUCKET/$BACKUP_S3_PREFIX/base/$BASE.sha256" . --region "$BACKUP_S3_REGION"
sha256sum -c "$BASE.sha256"                       # MUST print: OK
```

### B3. Stage the recovered data directory

```bash
export PITR_DATA_DIR=/var/lib/postgresql/pitr
export PITR_TARGET_TIME="$RECOVERY_TARGET"
export PITR_RECOVERY_ACTION=pause                 # inspect before promoting

cd backend
./scripts/backup/pitr-restore.sh ./"$BASE"
```

`pitr-restore.sh` extracts the base backup, writes `restore_command` (local WAL
archive, falling back to S3) and `recovery_target_time` into
`postgresql.auto.conf`, and creates `recovery.signal`. It never touches the live
data directory.

### B4. Start recovery

```bash
pg_ctl -D "$PITR_DATA_DIR" -l "$PITR_DATA_DIR/recovery.log" start
tail -f "$PITR_DATA_DIR/recovery.log"
```

With `recovery_target_action=pause` the server stops at the target and stays in
recovery so you can inspect it read-only. Check the data:

```bash
psql -h 127.0.0.1 -d skillsync -c "SELECT count(*) FROM users;"
```

When satisfied, promote to accept writes:

```bash
pg_ctl -D "$PITR_DATA_DIR" promote
```

### B5. Cut over

Repoint the application at the recovered cluster by replacing the live data
directory with `PITR_DATA_DIR` (stop PostgreSQL first, keep the old directory
aside as a backup), or repoint the container/volume. Then start the API.

## 4. Verify the restore

Regardless of path:

1. `GET /admin/backups/status` returns `"health": "healthy"`.
2. Run migrations if the restored state is behind: `npm run migration:run`.
3. Smoke-test the application (login, list mentors, create a booking).
4. Confirm the data loss window matches expectations and record it in the
   incident timeline.

## 5. After the incident

- Take a fresh backup immediately to protect the restored state:
  `./scripts/backup/backup.sh`.
- Keep the old/broken data directory until the post-mortem is closed.
- Write a post-mortem: root cause, recovery path used, time to restore (RTO) and
  data lost (RPO), and any follow-up actions.
- If the passphrase, bucket or IAM role was a blocker, fix it now and re-run the
  monthly restore test.

## Quick reference

| Task | Command |
| --- | --- |
| Stop writes | `docker compose stop backend` |
| List logical backups | `aws s3 ls s3://$BACKUP_S3_BUCKET/$BACKUP_S3_PREFIX/db/` |
| Verify a download | `sha256sum -c <artefact>.sha256` |
| Logical restore | `RESTORE_DATABASE=… ./scripts/backup/restore.sh <artefact>` |
| Stage PITR | `PITR_TARGET_TIME=… ./scripts/backup/pitr-restore.sh <base.tar.gz>` |
| Promote PITR | `pg_ctl -D "$PITR_DATA_DIR" promote` |
| Backup status | `GET /admin/backups/status` (admin JWT) |
