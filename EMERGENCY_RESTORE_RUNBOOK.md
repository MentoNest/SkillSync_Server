# Emergency Database Restore Runbook

## 🚨 CRITICAL: Read Before Proceeding

This runbook is for **EMERGENCY SITUATIONS ONLY**. Follow these steps carefully to minimize data loss and downtime.

---

## Quick Reference

| Scenario | Action | Estimated Time |
|----------|--------|----------------|
| Complete database failure | Full restore from latest backup | 15-30 minutes |
| Accidental data deletion | Point-in-time recovery | 30-60 minutes |
| Data corruption | Restore + verify | 20-40 minutes |
| Ransomware attack | Isolate + restore from clean backup | 1-2 hours |

---

## Emergency Contact Information

- **Database Administrator**: [Contact Info]
- **System Administrator**: [Contact Info]
- **DevOps Team**: [Contact Info]
- **Management**: [Contact Info]

---

## Scenario 1: Complete Database Failure

### Symptoms
- Application cannot connect to database
- PostgreSQL service won't start
- Database files are corrupted or missing

### Immediate Actions

#### Step 1: Assess the Situation (2 minutes)

```bash
# Check PostgreSQL status
sudo systemctl status postgresql

# Check PostgreSQL logs
sudo tail -100 /var/log/postgresql/postgresql-14-main.log

# Check disk space
df -h

# Check if database exists
PGPASSWORD="your-db-password" psql -h localhost -p 5432 -U postgres -l
```

#### Step 2: Notify Stakeholders (3 minutes)

Send incident notification:
```
SUBJECT: [INCIDENT] Database Failure - Restore in Progress

Message:
- Incident started: [TIME]
- Impact: Application unavailable
- ETA for resolution: 30-60 minutes
- Next update: [TIME + 30 minutes]
```

#### Step 3: Stop Application (2 minutes)

```bash
# Stop the application to prevent further errors
pm2 stop all
# OR
sudo systemctl stop skillsync-server
```

#### Step 4: Attempt PostgreSQL Recovery (5 minutes)

```bash
# Try to restart PostgreSQL
sudo systemctl restart postgresql

# Check if it started successfully
sudo systemctl status postgresql

# If it failed, check logs
sudo journalctl -xeu postgresql
```

#### Step 5: Restore from Latest Backup (15-20 minutes)

**If PostgreSQL won't start:**

```bash
# 1. Backup current (broken) database files
sudo mv /var/lib/postgresql/14/main /var/lib/postgresql/14/main.broken

# 2. Reinitialize PostgreSQL
sudo pg_createcluster 14 main --start

# 3. Stop PostgreSQL for restore
sudo systemctl stop postgresql
```

**If PostgreSQL starts but database is missing/corrupted:**

```bash
# 1. Drop corrupted database
PGPASSWORD="your-db-password" dropdb -h localhost -p 5432 -U postgres skillsync_db

# 2. Create fresh database
PGPASSWORD="your-db-password" createdb -h localhost -p 5432 -U postgres skillsync_db
```

**Restore the backup:**

```bash
# 1. List available backups
ls -lht ./backups/

# 2. If encrypted, decrypt first
openssl enc -d -aes-256-gcm \
  -in ./backups/LATEST_BACKUP.sql.gz.enc \
  -out ./backups/LATEST_BACKUP.sql.gz \
  -k your-encryption-key

# 3. Restore backup
PGPASSWORD="your-db-password" pg_restore \
  -h localhost \
  -p 5432 \
  -U postgres \
  -d skillsync_db \
  --clean \
  --if-exists \
  ./backups/LATEST_BACKUP.sql.gz

# 4. Verify restore
PGPASSWORD="your-db-password" psql -h localhost -p 5432 -U postgres -d skillsync_db -c "\dt"
PGPASSWORD="your-db-password" psql -h localhost -p 5432 -U postgres -d skillsync_db -c "SELECT count(*) FROM users;"
```

#### Step 6: Restart Application (2 minutes)

```bash
# Start the application
pm2 start all
# OR
sudo systemctl start skillsync-server

# Check application logs
pm2 logs
# OR
sudo journalctl -fu skillsync-server
```

#### Step 7: Verify System (5 minutes)

```bash
# 1. Test database connection
curl http://localhost:3000/api/health

# 2. Test key endpoints
curl http://localhost:3000/api/users
curl http://localhost:3000/api/mentors

# 3. Check application logs for errors
tail -100 logs/application.log
```

#### Step 8: Update Stakeholders (2 minutes)

```
SUBJECT: [RESOLVED] Database Restored Successfully

Message:
- Incident started: [TIME]
- Incident resolved: [TIME]
- Duration: [X minutes]
- Data loss: [None / Up to X hours]
- Root cause: [To be determined]
- Next steps: Post-incident review scheduled
```

---

## Scenario 2: Accidental Data Deletion

### Symptoms
- Users report missing data
- Recent deletions discovered
- Incorrect migration or script execution

### Immediate Actions

#### Step 1: Stop Writes Immediately (1 minute)

```bash
# Option 1: Stop application
pm2 stop all

# Option 2: Put database in read-only mode
PGPASSWORD="your-db-password" psql -h localhost -p 5432 -U postgres -d skillsync_db -c \
  "ALTER DATABASE skillsync_db SET default_transaction_read_only = on;"
```

#### Step 2: Identify Deletion Time (5 minutes)

```sql
-- Check recent transactions
SELECT * FROM pg_stat_activity WHERE datname = 'skillsync_db';

-- Check table statistics
SELECT schemaname, relname, last_vacuum, last_autovacuum, 
       last_analyze, last_autoanalyze
FROM pg_stat_user_tables
WHERE relname = 'affected_table';
```

#### Step 3: Point-in-Time Recovery (30-45 minutes)

```bash
# 1. Stop PostgreSQL
sudo systemctl stop postgresql

# 2. Backup current state (just in case)
sudo cp -r /var/lib/postgresql/14/main /var/lib/postgresql/14/main.pre-pitr

# 3. Find base backup before deletion
ls -lht ./backups/

# 4. Restore base backup
cd /var/lib/postgresql/14/main
sudo rm -rf *
sudo tar -xzf /path/to/base_backup.tar.gz

# 5. Configure PITR
sudo touch /var/lib/postgresql/14/main/recovery.signal
sudo bash -c 'cat >> /var/lib/postgresql/14/main/postgresql.auto.conf << EOF
restore_command = '\''cp /path/to/wal_archive/%f %p'\''
recovery_target_time = '\''2024-04-29 14:30:00'\''  # Time BEFORE deletion
recovery_target_action = '\''promote'\''
EOF'

# 6. Start PostgreSQL (will enter recovery mode)
sudo systemctl start postgresql

# 7. Monitor recovery
sudo tail -f /var/log/postgresql/postgresql-14-main.log

# 8. Verify data restored
PGPASSWORD="your-db-password" psql -h localhost -p 5432 -U postgres -d skillsync_db -c \
  "SELECT count(*) FROM affected_table;"
```

#### Step 4: Export Lost Data (10 minutes)

```bash
# Export the recovered data
PGPASSWORD="your-db-password" pg_dump \
  -h localhost \
  -p 5432 \
  -U postgres \
  -d skillsync_db \
  -t affected_table \
  -f ./recovered_data.sql
```

#### Step 5: Restore to Current Database (15 minutes)

```bash
# 1. Disable read-only mode
PGPASSWORD="your-db-password" psql -h localhost -p 5432 -U postgres -d skillsync_db -c \
  "ALTER DATABASE skillsync_db SET default_transaction_read_only = off;"

# 2. Import recovered data
PGPASSWORD="your-db-password" psql -h localhost -p 5432 -U postgres -d skillsync_db -f ./recovered_data.sql

# 3. Verify
PGPASSWORD="your-db-password" psql -h localhost -p 5432 -U postgres -d skillsync_db -c \
  "SELECT count(*) FROM affected_table;"
```

#### Step 6: Restart and Verify (5 minutes)

```bash
# Start application
pm2 start all

# Verify system
curl http://localhost:3000/api/health
```

---

## Scenario 3: Data Corruption

### Symptoms
- Application returning incorrect data
- Database integrity check failures
- Inconsistent query results

### Immediate Actions

#### Step 1: Identify Corruption (10 minutes)

```sql
-- Check for table corruption
SELECT * FROM pg_catalog.pg_class WHERE relname = 'affected_table';

-- Run integrity checks
VACUUM (VERBOSE, ANALYZE) affected_table;

-- Check indexes
SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'affected_table';

-- Rebuild indexes if needed
REINDEX TABLE affected_table;
```

#### Step 2: Backup Current State (5 minutes)

```bash
# Create emergency backup
PGPASSWORD="your-db-password" pg_dump \
  -h localhost \
  -p 5432 \
  -U postgres \
  -d skillsync_db \
  -F c \
  -f ./emergency_backup_$(date +%Y%m%d_%H%M%S).sql.gz
```

#### Step 3: Restore from Clean Backup (20-30 minutes)

Follow the same steps as Scenario 1, Step 5.

#### Step 4: Data Comparison (15 minutes)

```sql
-- Compare record counts
SELECT 'users' as table_name, count(*) FROM users
UNION ALL
SELECT 'mentors', count(*) FROM mentor_profiles
UNION ALL
SELECT 'sessions', count(*) FROM sessions;

-- Sample data verification
SELECT * FROM users ORDER BY created_at DESC LIMIT 10;
```

---

## Scenario 4: Ransomware/Security Breach

### Symptoms
- Unexpected encrypted files
- Unauthorized access detected
- Suspicious database activity

### Immediate Actions

#### Step 1: Isolate the System (2 minutes)

```bash
# 1. Disconnect from network (if possible)
sudo ifconfig eth0 down

# 2. Stop all services
sudo systemctl stop skillsync-server
sudo systemctl stop postgresql

# 3. Block external access
sudo ufw deny 5432
sudo ufw deny 3000
```

#### Step 2: Assess Damage (15 minutes)

```bash
# 1. Check for unauthorized access
sudo last
sudo grep "Failed password" /var/log/auth.log | tail -20

# 2. Check database logs
sudo tail -100 /var/log/postgresql/postgresql-14-main.log

# 3. Check for suspicious files
find /var/lib/postgresql -name "*.encrypted" -o -name "*.locked" 2>/dev/null

# 4. Verify backup integrity
ls -lht ./backups/
```

#### Step 3: Notify Security Team (5 minutes)

```
SUBJECT: [SECURITY INCIDENT] Possible Database Breach

Message:
- Incident detected: [TIME]
- Systems affected: [LIST]
- Immediate actions taken: [LIST]
- Requesting: Security team investigation
```

#### Step 4: Restore from Clean Backup (30-45 minutes)

**Important**: Use a backup from BEFORE the breach occurred.

```bash
# 1. Secure the server
sudo systemctl stop postgresql
sudo rm -rf /var/lib/postgresql/14/main
sudo pg_createcluster 14 main --start

# 2. Change all passwords
PGPASSWORD="your-db-password" psql -h localhost -p 5432 -U postgres -c \
  "ALTER USER postgres WITH PASSWORD 'new-secure-password';"

# 3. Restore from clean backup
PGPASSWORD="new-secure-password" pg_restore \
  -h localhost \
  -p 5432 \
  -U postgres \
  -d skillsync_db \
  --clean \
  --if-exists \
  ./backups/CLEAN_BACKUP_BEFORE_BREACH.sql.gz

# 4. Update application credentials
# Edit .env file with new database password
```

#### Step 5: Security Hardening (30 minutes)

```bash
# 1. Update PostgreSQL configuration
sudo nano /etc/postgresql/14/main/pg_hba.conf

# Restrict access to localhost only
# Change:
# host all all 0.0.0.0/0 md5
# To:
# host all all 127.0.0.1/32 md5

# 2. Enable SSL
sudo nano /etc/postgresql/14/main/postgresql.conf
# ssl = on
# ssl_cert_file = '/etc/ssl/certs/ssl-cert-snakeoil.pem'
# ssl_key_file = '/etc/ssl/private/ssl-cert-snakeoil.key'

# 3. Restart PostgreSQL
sudo systemctl restart postgresql

# 4. Update application secrets
# Generate new JWT_SECRET
openssl rand -base64 32

# Generate new BACKUP_ENCRYPTION_KEY
openssl rand -base64 32
```

#### Step 6: Monitor and Verify (Ongoing)

```bash
# 1. Monitor for suspicious activity
sudo tail -f /var/log/postgresql/postgresql-14-main.log
sudo tail -f /var/log/auth.log

# 2. Set up enhanced logging
# Configure audit logging in PostgreSQL

# 3. Verify backups are clean
ls -lht ./backups/
```

---

## Post-Incident Checklist

After any emergency restore, complete these steps:

### Immediate (Within 1 hour)
- [ ] System is operational
- [ ] Data integrity verified
- [ ] Stakeholders notified
- [ ] Incident timeline documented

### Short-term (Within 24 hours)
- [ ] Root cause identified
- [ ] Affected data recovered or restored
- [ ] Security vulnerabilities patched
- [ ] Backup schedule verified
- [ ] Monitoring alerts configured

### Long-term (Within 1 week)
- [ ] Post-incident review completed
- [ ] Lessons learned documented
- [ ] Runbook updated if needed
- [ ] Preventive measures implemented
- [ ] Team training conducted

---

## Emergency Commands Quick Reference

### Check System Status
```bash
sudo systemctl status postgresql
sudo systemctl status skillsync-server
df -h
free -m
```

### Backup Commands
```bash
# Create backup
PGPASSWORD="password" pg_dump -h localhost -p 5432 -U postgres -d skillsync_db -F c -f backup.sql.gz

# Decrypt backup
openssl enc -d -aes-256-gcm -in backup.enc -out backup.sql.gz -k key

# List backups
ls -lht ./backups/
```

### Restore Commands
```bash
# Create database
PGPASSWORD="password" createdb -h localhost -p 5432 -U postgres skillsync_db

# Restore backup
PGPASSWORD="password" pg_restore -h localhost -p 5432 -U postgres -d skillsync_db --clean --if-exists backup.sql.gz

# Verify restore
PGPASSWORD="password" psql -h localhost -p 5432 -U postgres -d skillsync_db -c "\dt"
```

### Emergency Stop
```bash
# Stop everything
pm2 stop all
sudo systemctl stop postgresql
sudo ufw deny 5432
```

---

## Important Notes

1. **Never skip the backup step** before attempting any restore
2. **Always test restores** in a staging environment first
3. **Document everything** during the incident
4. **Communicate regularly** with stakeholders
5. **Don't panic** - follow the runbook step by step

---

## Additional Resources

- PostgreSQL Documentation: https://www.postgresql.org/docs/
- Backup Procedures: `DATABASE_BACKUP_PROCEDURES.md`
- Application Logs: `/var/log/skillsync/`
- PostgreSQL Logs: `/var/log/postgresql/`

---

**Last Updated**: 2024-04-29  
**Reviewed By**: [Name]  
**Next Review**: 2024-07-29
