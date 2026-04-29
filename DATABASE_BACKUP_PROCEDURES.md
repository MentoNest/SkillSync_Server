# Database Backup and Restore Procedures

## Overview

This document outlines the manual and automated backup and restore procedures for the SkillSync PostgreSQL database. The backup system includes:

- **Automated Daily Backups**: Scheduled at 3:00 AM every day
- **30-Day Retention Policy**: Automatic cleanup of backups older than 30 days
- **Backup Encryption**: AES-256-GCM encryption for all backups
- **Point-in-Time Recovery (PITR)**: WAL archiving support for recovery to any timestamp
- **Monthly Verification**: Automated backup integrity testing
- **S3 Offsite Storage**: Optional cloud backup storage with encryption
- **Failure Alerts**: Email notifications for backup failures

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Configuration](#configuration)
3. [Automated Backups](#automated-backups)
4. [Manual Backup Procedures](#manual-backup-procedures)
5. [Restore Procedures](#restore-procedures)
6. [Point-in-Time Recovery](#point-in-time-recovery)
7. [Backup Verification](#backup-verification)
8. [Monitoring and Alerts](#monitoring-and-alerts)
9. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Tools

- **PostgreSQL Client Tools**: `pg_dump` and `pg_restore` must be installed and available in the system PATH
- **Node.js**: Version 18 or higher
- **NestJS CLI**: For running the application

### PostgreSQL Configuration

For Point-in-Time Recovery (PITR), configure PostgreSQL WAL archiving:

1. Edit `postgresql.conf`:
```conf
wal_level = replica
archive_mode = on
archive_command = 'cp %p /path/to/wal_archive/%f'
```

2. Restart PostgreSQL:
```bash
sudo systemctl restart postgresql
```

3. Verify configuration:
```sql
SHOW wal_level;
SHOW archive_mode;
SHOW archive_command;
```

---

## Configuration

### Environment Variables

Add the following to your `.env` file:

```env
# Backup Configuration
BACKUP_DIRECTORY=./backups
WAL_ARCHIVE_DIRECTORY=./wal_archive
BACKUP_RETENTION_DAYS=30
BACKUP_ENCRYPTION_ENABLED=true
BACKUP_ENCRYPTION_KEY=your-encryption-key-min-32-characters

# S3 Configuration (Optional)
BACKUP_S3_ENABLED=false
BACKUP_S3_BUCKET=your-backup-bucket
BACKUP_S3_REGION=us-east-1
BACKUP_S3_ACCESS_KEY=your-aws-access-key
BACKUP_S3_SECRET_KEY=your-aws-secret-key

# Alert Configuration
BACKUP_ALERT_EMAIL=admin@yourdomain.com
```

### Generate Encryption Key

```bash
openssl rand -base64 32
```

---

## Automated Backups

### Schedule

- **Daily Backup**: Every day at 3:00 AM
- **Retention Cleanup**: Every day at 5:00 AM (removes backups older than 30 days)
- **Monthly Verification**: First Sunday of each month at 4:00 AM

### What Gets Backed Up

- Full database schema
- All table data
- Indexes and constraints
- WAL files (if enabled)

### Backup Location

- Local: `./backups/backup_YYYY-MM-DDTHH-MM-SS.sql.gz`
- Encrypted: `./backups/backup_YYYY-MM-DDTHH-MM-SS.sql.gz.enc`
- S3: `s3://your-backup-bucket/backups/backup_YYYY-MM-DDTHH-MM-SS.sql.gz.enc`

---

## Manual Backup Procedures

### Via API

#### Create a Manual Backup

```bash
curl -X POST http://localhost:3000/api/database/backups \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "Manual backup before deployment",
    "includeWal": true
  }'
```

**Response:**
```json
{
  "id": "uuid-here",
  "fileName": "backup_2024-04-29T10-30-00.sql.gz",
  "filePath": "./backups/backup_2024-04-29T10-30-00.sql.gz",
  "status": "completed",
  "type": "manual",
  "isEncrypted": true,
  "fileSize": 1048576,
  "createdAt": "2024-04-29T10:30:00.000Z"
}
```

### Via Command Line

#### Full Database Backup

```bash
# Without encryption
PGPASSWORD="your-db-password" pg_dump \
  -h localhost \
  -p 5432 \
  -U postgres \
  -d skillsync_db \
  -F c \
  -f ./backups/manual_backup_$(date +%Y%m%d_%H%M%S).sql.gz

# With encryption
openssl enc -aes-256-gcm \
  -in ./backups/manual_backup_20240429_103000.sql.gz \
  -out ./backups/manual_backup_20240429_103000.sql.gz.enc \
  -k your-encryption-key
```

#### Schema Only Backup

```bash
PGPASSWORD="your-db-password" pg_dump \
  -h localhost \
  -p 5432 \
  -U postgres \
  -d skillsync_db \
  --schema-only \
  -f ./backups/schema_backup_$(date +%Y%m%d_%H%M%S).sql
```

#### Data Only Backup

```bash
PGPASSWORD="your-db-password" pg_dump \
  -h localhost \
  -p 5432 \
  -U postgres \
  -d skillsync_db \
  --data-only \
  -F c \
  -f ./backups/data_backup_$(date +%Y%m%d_%H%M%S).sql.gz
```

### Verify Backup Files

```bash
# List backups
ls -lh ./backups/

# Check backup integrity
pg_restore --list ./backups/backup_20240429_103000.sql.gz
```

---

## Restore Procedures

### ⚠️ WARNING

Restoring a backup will **overwrite** the current database. Always:
1. Create a backup of the current database before restoring
2. Test the restore process in a staging environment first
3. Notify users of potential downtime

### Via API

#### Restore from Backup

```bash
curl -X POST http://localhost:3000/api/database/backups/BACKUP_ID/restore \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "confirm": true,
    "targetTimestamp": "2024-04-29T10:30:00.000Z" (optional)
  }'
```

### Via Command Line

#### Full Database Restore

```bash
# Stop the application to prevent data corruption
npm run stop

# Drop and recreate the database
PGPASSWORD="your-db-password" dropdb -h localhost -p 5432 -U postgres skillsync_db
PGPASSWORD="your-db-password" createdb -h localhost -p 5432 -U postgres skillsync_db

# Restore from backup
PGPASSWORD="your-db-password" pg_restore \
  -h localhost \
  -p 5432 \
  -U postgres \
  -d skillsync_db \
  --clean \
  --if-exists \
  ./backups/backup_20240429_103000.sql.gz

# Restart the application
npm run start:prod
```

#### Restore Encrypted Backup

```bash
# Decrypt the backup first
openssl enc -d -aes-256-gcm \
  -in ./backups/backup_20240429_103000.sql.gz.enc \
  -out ./backups/backup_20240429_103000.sql.gz \
  -k your-encryption-key

# Then restore using the decrypted file
PGPASSWORD="your-db-password" pg_restore \
  -h localhost \
  -p 5432 \
  -U postgres \
  -d skillsync_db \
  --clean \
  --if-exists \
  ./backups/backup_20240429_103000.sql.gz
```

#### Restore to a New Database (Testing)

```bash
# Create a test database
PGPASSWORD="your-db-password" createdb -h localhost -p 5432 -U postgres skillsync_test

# Restore to test database
PGPASSWORD="your-db-password" pg_restore \
  -h localhost \
  -p 5432 \
  -U postgres \
  -d skillsync_test \
  --no-owner \
  --no-privileges \
  ./backups/backup_20240429_103000.sql.gz

# Verify
PGPASSWORD="your-db-password" psql -h localhost -p 5432 -U postgres -d skillsync_test -c "\dt"
```

---

## Point-in-Time Recovery

Point-in-Time Recovery (PITR) allows you to restore the database to any specific timestamp using WAL (Write-Ahead Logging) files.

### Requirements

- WAL archiving must be enabled in PostgreSQL
- Base backup must exist
- WAL files must be available from backup time to target time

### Via API

```bash
curl -X POST http://localhost:3000/api/database/backups/BACKUP_ID/restore \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "confirm": true,
    "targetTimestamp": "2024-04-29T15:45:00.000Z"
  }'
```

### Manual PITR Process

1. **Stop PostgreSQL**:
```bash
sudo systemctl stop postgresql
```

2. **Restore base backup**:
```bash
cd /var/lib/postgresql/14/main
rm -rf *
tar -xzf /path/to/base_backup.tar.gz
```

3. **Configure recovery**:
```bash
# Create recovery.signal
touch /var/lib/postgresql/14/main/recovery.signal

# Edit postgresql.auto.conf
echo "restore_command = 'cp /path/to/wal_archive/%f %p'" >> postgresql.auto.conf
echo "recovery_target_time = '2024-04-29 15:45:00'" >> postgresql.auto.conf
```

4. **Start PostgreSQL**:
```bash
sudo systemctl start postgresql
```

5. **Monitor recovery**:
```bash
tail -f /var/log/postgresql/postgresql-14-main.log
```

6. **Verify recovery**:
```sql
SELECT now();
SELECT count(*) FROM your_table;
```

---

## Backup Verification

### Automated Verification

The system automatically verifies backups on the first Sunday of each month at 4:00 AM.

### Manual Verification via API

```bash
curl -X POST http://localhost:3000/api/database/backups/BACKUP_ID/verify \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Manual Verification Process

1. **Restore to test database**:
```bash
PGPASSWORD="your-db-password" createdb -h localhost -p 5432 -U postgres skillsync_verify_test

PGPASSWORD="your-db-password" pg_restore \
  -h localhost \
  -p 5432 \
  -U postgres \
  -d skillsync_verify_test \
  --no-owner \
  --no-privileges \
  ./backups/backup_20240429_103000.sql.gz
```

2. **Verify table count**:
```sql
SELECT count(*) FROM information_schema.tables WHERE table_schema = 'public';
```

3. **Verify record counts**:
```sql
SELECT schemaname, tablename, n_live_tup 
FROM pg_stat_user_tables 
ORDER BY n_live_tup DESC;
```

4. **Run sample queries**:
```sql
SELECT count(*) FROM users;
SELECT count(*) FROM mentor_profiles;
SELECT * FROM users LIMIT 10;
```

5. **Clean up**:
```bash
PGPASSWORD="your-db-password" dropdb -h localhost -p 5432 -U postgres skillsync_verify_test
```

---

## Monitoring and Alerts

### Check Backup Status via API

```bash
curl http://localhost:3000/api/database/backups/status \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "totalBackups": 15,
  "totalSize": 157286400,
  "latestBackup": "2024-04-29T03:00:00.000Z",
  "nextScheduledBackup": "2024-04-30T03:00:00.000Z",
  "schedule": "0 3 * * * (Daily at 3:00 AM)",
  "retentionDays": 30,
  "walArchivingEnabled": true,
  "encryptionEnabled": true,
  "lastBackupStatus": "success",
  "lastBackupError": null
}
```

### List All Backups

```bash
curl http://localhost:3000/api/database/backups \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### View Backup Details

```bash
curl http://localhost:3000/api/database/backups/BACKUP_ID \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

### Alert Configuration

Backup failures are automatically logged and can be configured to send email alerts:

- Set `BACKUP_ALERT_EMAIL` in `.env`
- Integrate with monitoring systems (Prometheus, Datadog, etc.)
- Configure webhook notifications

---

## Troubleshooting

### Backup Fails

**Problem**: Backup process fails with error

**Solutions**:
1. Check PostgreSQL connection:
```bash
PGPASSWORD="your-db-password" psql -h localhost -p 5432 -U postgres -d skillsync_db -c "SELECT 1"
```

2. Verify disk space:
```bash
df -h
```

3. Check backup logs:
```bash
tail -f logs/backup.log
```

4. Verify `pg_dump` is installed:
```bash
which pg_dump
pg_dump --version
```

### Restore Fails

**Problem**: Restore process fails or data is corrupted

**Solutions**:
1. Verify backup file integrity:
```bash
pg_restore --list ./backups/backup_file.sql.gz
```

2. Check database permissions:
```sql
SELECT * FROM pg_roles WHERE rolname = 'postgres';
```

3. Verify PostgreSQL version compatibility:
```bash
pg_dump --version
psql --version
```

### Encryption Issues

**Problem**: Cannot decrypt backup

**Solutions**:
1. Verify encryption key is correct:
```bash
echo $BACKUP_ENCRYPTION_KEY | wc -c
```

2. Test decryption:
```bash
openssl enc -d -aes-256-gcm \
  -in ./backups/backup.enc \
  -out /tmp/test_decrypt.sql.gz \
  -k your-encryption-key
```

### WAL Archiving Not Working

**Problem**: WAL files are not being archived

**Solutions**:
1. Check PostgreSQL configuration:
```sql
SHOW archive_mode;
SHOW archive_command;
SHOW wal_level;
```

2. Verify archive directory permissions:
```bash
ls -la /path/to/wal_archive/
```

3. Check PostgreSQL logs:
```bash
tail -f /var/log/postgresql/postgresql-14-main.log
```

---

## Backup Best Practices

1. **Regular Testing**: Test restore procedures monthly
2. **Offsite Storage**: Always maintain offsite backups (S3, etc.)
3. **Encryption**: Never store unencrypted backups offsite
4. **Monitoring**: Set up alerts for backup failures
5. **Documentation**: Keep this document updated
6. **Access Control**: Restrict backup file access
7. **Version Control**: Track backup system changes
8. **Disaster Recovery**: Maintain a separate DR environment

---

## Support

For issues or questions:
- Check application logs
- Review PostgreSQL logs
- Contact database administrator
- Refer to emergency restore runbook: `EMERGENCY_RESTORE_RUNBOOK.md`
