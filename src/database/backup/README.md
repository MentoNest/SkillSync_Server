# Database Backup System

## Overview

Automated PostgreSQL backup system with enterprise-grade features for the SkillSync application.

## Features

✅ **Automated Daily Backups** - Scheduled at 3:00 AM every day  
✅ **30-Day Retention Policy** - Automatic cleanup of expired backups  
✅ **Backup Encryption** - AES-256-GCM encryption for security  
✅ **Point-in-Time Recovery** - WAL archiving support  
✅ **Monthly Verification** - Automated backup integrity testing  
✅ **S3 Offsite Storage** - Optional cloud backup storage  
✅ **Failure Alerts** - Email notifications for backup failures  
✅ **Admin Status Endpoint** - Real-time backup monitoring  

## Quick Start

### 1. Configure Environment Variables

Add to your `.env` file:

```env
# Backup Configuration
BACKUP_DIRECTORY=./backups
WAL_ARCHIVE_DIRECTORY=./wal_archive
BACKUP_RETENTION_DAYS=30
BACKUP_ENCRYPTION_ENABLED=true
BACKUP_ENCRYPTION_KEY=your-encryption-key-min-32-characters

# Optional: S3 Storage
BACKUP_S3_ENABLED=false
BACKUP_S3_BUCKET=your-backup-bucket
BACKUP_S3_REGION=us-east-1
BACKUP_S3_ACCESS_KEY=your-aws-access-key
BACKUP_S3_SECRET_KEY=your-aws-secret-key

# Alert Email
BACKUP_ALERT_EMAIL=admin@yourdomain.com
```

### 2. Generate Encryption Key

```bash
openssl rand -base64 32
```

### 3. Run Database Migration

```bash
npm run migration:run
```

### 4. Start the Application

```bash
npm run start:dev
```

## API Endpoints

All endpoints require authentication (JWT token).

### Create Backup

```bash
POST /api/database/backups
Content-Type: application/json
Authorization: Bearer {token}

{
  "description": "Manual backup before deployment",
  "includeWal": true
}
```

### List Backups

```bash
GET /api/database/backups
Authorization: Bearer {token}
```

### Get Backup Details

```bash
GET /api/database/backups/:id
Authorization: Bearer {token}
```

### Delete Backup

```bash
DELETE /api/database/backups/:id
Authorization: Bearer {token}
```

### Verify Backup

```bash
POST /api/database/backups/:id/verify
Authorization: Bearer {token}
```

### Restore Backup

```bash
POST /api/database/backups/:id/restore
Content-Type: application/json
Authorization: Bearer {token}

{
  "confirm": true,
  "targetTimestamp": "2024-04-29T10:30:00.000Z" // Optional for PITR
}
```

### Get Backup Status

```bash
GET /api/database/backups/status
Authorization: Bearer {token}
```

## Automated Schedules

| Task | Schedule | Description |
|------|----------|-------------|
| Daily Backup | 3:00 AM | Full database backup |
| Cleanup | 5:00 AM | Remove backups older than 30 days |
| Verification | First Sunday 4:00 AM | Test backup integrity |

## Backup Storage

### Local Storage
- Directory: `./backups/`
- Format: `backup_YYYY-MM-DDTHH-MM-SS.sql.gz`
- Encrypted: `backup_YYYY-MM-DDTHH-MM-SS.sql.gz.enc`

### S3 Storage (Optional)
- Bucket: Configured via `BACKUP_S3_BUCKET`
- Path: `backups/backup_YYYY-MM-DDTHH-MM-SS.sql.gz.enc`
- Encryption: Server-side encryption + application-level encryption

## Point-in-Time Recovery (PITR)

### Enable WAL Archiving

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

3. Verify:
```sql
SHOW archive_mode;
SHOW wal_level;
```

### Perform PITR

Use the API with `targetTimestamp` parameter:

```bash
POST /api/database/backups/:id/restore
{
  "confirm": true,
  "targetTimestamp": "2024-04-29T15:45:00.000Z"
}
```

## Monitoring

### Check Backup Status

```bash
curl http://localhost:3000/api/database/backups/status \
  -H "Authorization: Bearer YOUR_TOKEN"
```

Response:
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

### Alert Configuration

Set `BACKUP_ALERT_EMAIL` to receive failure notifications via email.

## Documentation

- **Backup & Restore Procedures**: `DATABASE_BACKUP_PROCEDURES.md`
- **Emergency Restore Runbook**: `EMERGENCY_RESTORE_RUNBOOK.md`

## Security

- All backups are encrypted with AES-256-GCM
- Encryption key must be at least 32 characters
- Backup files should have restricted permissions
- S3 uploads use both application-level and server-side encryption
- Access to backup endpoints requires authentication

## Best Practices

1. **Test Restores Monthly** - Use the verification endpoint
2. **Monitor Alerts** - Check `BACKUP_ALERT_EMAIL` regularly
3. **Offsite Storage** - Enable S3 for disaster recovery
4. **Secure Keys** - Store encryption keys securely (AWS KMS, HashiCorp Vault)
5. **Regular Audits** - Review backup logs and status
6. **Document Changes** - Update runbooks when procedures change

## Troubleshooting

### Backup Fails
- Check PostgreSQL connection
- Verify disk space: `df -h`
- Check logs: `tail -f logs/application.log`
- Ensure `pg_dump` is installed: `which pg_dump`

### Restore Fails
- Verify backup file integrity
- Check database permissions
- Ensure PostgreSQL version compatibility

### Encryption Issues
- Verify encryption key length (min 32 chars)
- Test decryption manually
- Check key hasn't been changed

## Support

For issues:
1. Check application logs
2. Review PostgreSQL logs
3. Refer to `DATABASE_BACKUP_PROCEDURES.md`
4. Follow `EMERGENCY_RESTORE_RUNBOOK.md` for critical issues

## License

Part of SkillSync Server project.
