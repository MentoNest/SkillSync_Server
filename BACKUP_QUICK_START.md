# Database Backup System - Quick Start Guide

Get your automated database backup system up and running in 5 minutes!

---

## Prerequisites

- ✅ PostgreSQL installed and running
- ✅ `pg_dump` and `pg_restore` available in PATH
- ✅ Node.js 18+ and npm
- ✅ Application running

---

## Step 1: Configure Environment Variables

Add these to your `.env` file:

```env
# === Backup Configuration ===
BACKUP_DIRECTORY=./backups
WAL_ARCHIVE_DIRECTORY=./wal_archive
BACKUP_RETENTION_DAYS=30

# Encryption (REQUIRED for production)
BACKUP_ENCRYPTION_ENABLED=true
BACKUP_ENCRYPTION_KEY=your-encryption-key-min-32-characters

# Alert Email
BACKUP_ALERT_EMAIL=admin@yourdomain.com
```

### Generate Encryption Key

**Linux/Mac:**
```bash
openssl rand -base64 32
```

**Windows (PowerShell):**
```powershell
-join ((65..90) + (97..122) + (48..57) | Get-Random -Count 32 | ForEach-Object {[char]$_})
```

Copy the output and set it as `BACKUP_ENCRYPTION_KEY`.

---

## Step 2: Run Database Migration

```bash
npm run migration:run
```

This creates the `database_backups` table to track all backup operations.

---

## Step 3: Start the Application

```bash
npm run start:dev
```

The backup service will automatically:
- Create backup directories (`./backups`, `./wal_archive`)
- Initialize scheduled jobs
- Log: "Database backup service initialized"

---

## Step 4: Test the System

### Option A: Use Test Script

**Windows (PowerShell):**
```powershell
.\test-backup-system.ps1
```

**Linux/Mac:**
```bash
chmod +x test-backup-system.sh
./test-backup-system.sh
```

### Option B: Manual Testing

**1. Create a backup:**
```bash
curl -X POST http://localhost:3000/api/database/backups \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "description": "My first backup",
    "includeWal": true
  }'
```

**2. Check backup status:**
```bash
curl http://localhost:3000/api/database/backups/status \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**3. List all backups:**
```bash
curl http://localhost:3000/api/database/backups \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

---

## Step 5: Verify Automated Backups

The system will automatically create backups at **3:00 AM every day**.

To test immediately, use the API to create a manual backup (see Step 4).

---

## What's Running Automatically?

| Task | Schedule | Description |
|------|----------|-------------|
| **Daily Backup** | 3:00 AM | Full database backup with compression |
| **Cleanup** | 5:00 AM | Delete backups older than 30 days |
| **Verification** | First Sunday 4:00 AM | Test backup integrity |

---

## File Structure

After the first backup, you'll see:

```
your-project/
├── backups/
│   └── backup_2024-04-29T03-00-00.sql.gz.enc    # Encrypted backup
├── wal_archive/                                  # WAL files (if enabled)
└── .env                                          # Your configuration
```

---

## Optional: Enable Point-in-Time Recovery

For advanced recovery to any timestamp:

### 1. Configure PostgreSQL

Edit `postgresql.conf`:

```conf
wal_level = replica
archive_mode = on
archive_command = 'cp %p C:/path/to/wal_archive/%f'  # Windows
# OR
archive_command = 'cp %p /path/to/wal_archive/%f'    # Linux/Mac
```

### 2. Restart PostgreSQL

```bash
# Windows
net stop postgresql-x64-14
net start postgresql-x64-14

# Linux
sudo systemctl restart postgresql
```

### 3. Verify

```sql
SHOW archive_mode;
SHOW wal_level;
```

---

## Optional: Enable S3 Storage

For offsite backup storage:

```env
BACKUP_S3_ENABLED=true
BACKUP_S3_BUCKET=your-backup-bucket
BACKUP_S3_REGION=us-east-1
BACKUP_S3_ACCESS_KEY=your-aws-access-key
BACKUP_S3_SECRET_KEY=your-aws-secret-key
```

---

## Monitoring

### Check Backup Status

```bash
curl http://localhost:3000/api/database/backups/status \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response:**
```json
{
  "totalBackups": 1,
  "totalSize": 1048576,
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

---

## Next Steps

✅ **Read Full Documentation**:
- `DATABASE_BACKUP_PROCEDURES.md` - Complete procedures
- `EMERGENCY_RESTORE_RUNBOOK.md` - Emergency scenarios
- `BACKUP_IMPLEMENTATION_SUMMARY.md` - Implementation details

✅ **Test Restore Process**:
```bash
# List backups
curl http://localhost:3000/api/database/backups \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"

# Restore from backup (BE CAREFUL!)
curl -X POST http://localhost:3000/api/database/backups/BACKUP_ID/restore \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"confirm": true}'
```

✅ **Set Up Monitoring**:
- Configure alerts in your monitoring system
- Set up email notifications
- Monitor backup status endpoint

✅ **Schedule Regular Tests**:
- Test restore monthly
- Review backup logs weekly
- Verify disk space daily

---

## Troubleshooting

### "pg_dump: command not found"

Install PostgreSQL client tools:

**Windows:**
- Already included with PostgreSQL installation
- Add to PATH: `C:\Program Files\PostgreSQL\14\bin`

**Linux:**
```bash
sudo apt-get install postgresql-client
```

**Mac:**
```bash
brew install libpq
```

### Backup Fails

1. Check PostgreSQL is running
2. Verify database credentials in `.env`
3. Check disk space: `df -h` (Linux/Mac) or `Get-PSDrive` (Windows)
4. Review application logs

### Encryption Key Error

- Key must be at least 32 characters
- Generate with: `openssl rand -base64 32`
- Don't change the key after creating backups!

---

## Support

- 📖 **Documentation**: See files listed above
- 🐛 **Issues**: Check application logs
- 🚨 **Emergencies**: Follow `EMERGENCY_RESTORE_RUNBOOK.md`

---

**That's it!** Your database is now protected with automated backups. 🎉
