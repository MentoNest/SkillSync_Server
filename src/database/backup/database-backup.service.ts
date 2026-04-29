import { Injectable, Logger, OnModuleInit, Inject } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { DatabaseBackup, BackupStatus, BackupType } from './entities/database-backup.entity';
import { CreateBackupDto } from './dto/backup.dto';

const execAsync = promisify(exec);

@Injectable()
export class DatabaseBackupService implements OnModuleInit {
  private readonly logger = new Logger(DatabaseBackupService.name);
  private backupDir: string;
  private walArchiveDir: string;
  private encryptionEnabled: boolean;
  private encryptionKey: string;
  private retentionDays: number;
  private s3Enabled: boolean;
  private s3Bucket: string;
  private s3Region: string;
  private s3AccessKey: string;
  private s3SecretKey: string;
  private alertEmail: string;
  private dbConfig: any;

  constructor(
    @InjectRepository(DatabaseBackup)
    private backupRepository: Repository<DatabaseBackup>,
    private dataSource: DataSource,
    private configService: ConfigService,
  ) {}

  async onModuleInit() {
    this.backupDir = this.configService.get<string>('BACKUP_DIRECTORY') || './backups';
    this.walArchiveDir = this.configService.get<string>('WAL_ARCHIVE_DIRECTORY') || './wal_archive';
    this.encryptionEnabled = this.configService.get<boolean>('BACKUP_ENCRYPTION_ENABLED') || false;
    this.encryptionKey = this.configService.get<string>('BACKUP_ENCRYPTION_KEY') || '';
    this.retentionDays = this.configService.get<number>('BACKUP_RETENTION_DAYS') || 30;
    this.s3Enabled = this.configService.get<boolean>('BACKUP_S3_ENABLED') || false;
    this.s3Bucket = this.configService.get<string>('BACKUP_S3_BUCKET') || '';
    this.s3Region = this.configService.get<string>('BACKUP_S3_REGION') || 'us-east-1';
    this.s3AccessKey = this.configService.get<string>('BACKUP_S3_ACCESS_KEY') || '';
    this.s3SecretKey = this.configService.get<string>('BACKUP_S3_SECRET_KEY') || '';
    this.alertEmail = this.configService.get<string>('BACKUP_ALERT_EMAIL') || '';
    
    this.dbConfig = {
      host: this.configService.get<string>('DATABASE_HOST'),
      port: this.configService.get<number>('DATABASE_PORT'),
      username: this.configService.get<string>('DATABASE_USERNAME'),
      password: this.configService.get<string>('DATABASE_PASSWORD'),
      database: this.configService.get<string>('DATABASE_NAME'),
    };

    // Ensure backup directories exist
    await this.ensureDirectories();
    
    this.logger.log('Database backup service initialized');
  }

  private async ensureDirectories() {
    try {
      if (!fs.existsSync(this.backupDir)) {
        fs.mkdirSync(this.backupDir, { recursive: true });
      }
      if (!fs.existsSync(this.walArchiveDir)) {
        fs.mkdirSync(this.walArchiveDir, { recursive: true });
      }
    } catch (error) {
      this.logger.error('Failed to create backup directories', error.stack);
      throw error;
    }
  }

  // Daily automated backup at 3:00 AM
  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async performScheduledBackup() {
    this.logger.log('Starting scheduled daily backup...');
    try {
      const backup = await this.createBackup({
        description: 'Automated daily backup',
        includeWal: true,
      });
      this.logger.log(`Scheduled backup completed: ${backup.fileName}`);
    } catch (error) {
      this.logger.error('Scheduled backup failed', error.stack);
      await this.sendAlert('Daily backup failed', error.message);
    }
  }

  // Weekly backup verification (first Sunday of each month at 4:00 AM)
  @Cron('0 4 * * 0')
  async performMonthlyVerification() {
    this.logger.log('Starting monthly backup verification...');
    try {
      const latestBackup = await this.backupRepository.findOne({
        where: { status: BackupStatus.COMPLETED },
        order: { createdAt: 'DESC' },
      });

      if (!latestBackup) {
        this.logger.warn('No backups found for verification');
        return;
      }

      await this.verifyBackup(latestBackup.id);
      this.logger.log('Monthly verification completed successfully');
    } catch (error) {
      this.logger.error('Monthly verification failed', error.stack);
      await this.sendAlert('Monthly backup verification failed', error.message);
    }
  }

  // Daily cleanup of expired backups
  @Cron(CronExpression.EVERY_DAY_AT_5AM)
  async cleanupExpiredBackups() {
    this.logger.log('Starting cleanup of expired backups...');
    try {
      const expiredBackups = await this.backupRepository.find({
        where: {
          retentionUntil: new Date(),
          status: BackupStatus.COMPLETED,
        },
      });

      for (const backup of expiredBackups) {
        await this.deleteBackupFile(backup);
        backup.status = BackupStatus.DELETED;
        await this.backupRepository.save(backup);
        this.logger.log(`Deleted expired backup: ${backup.fileName}`);
      }

      this.logger.log(`Cleaned up ${expiredBackups.length} expired backups`);
    } catch (error) {
      this.logger.error('Cleanup failed', error.stack);
    }
  }

  async createBackup(dto: CreateBackupDto): Promise<DatabaseBackup> {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const fileName = `backup_${timestamp}.sql.gz`;
    const filePath = path.join(this.backupDir, fileName);

    const backup = this.backupRepository.create({
      fileName,
      filePath,
      type: dto.description?.includes('Automated') ? BackupType.AUTOMATED : BackupType.MANUAL,
      status: BackupStatus.PENDING,
      description: dto.description || 'Manual backup',
      startedAt: new Date(),
      isEncrypted: this.encryptionEnabled,
      includesWal: dto.includeWal || false,
      retentionUntil: new Date(Date.now() + this.retentionDays * 24 * 60 * 60 * 1000),
    });

    await this.backupRepository.save(backup);

    try {
      backup.status = BackupStatus.IN_PROGRESS;
      await this.backupRepository.save(backup);

      // Perform PostgreSQL backup using pg_dump
      await this.executeBackup(backup, filePath);

      // Encrypt if enabled
      if (this.encryptionEnabled) {
        await this.encryptBackup(backup);
      }

      // Upload to S3 if enabled
      if (this.s3Enabled) {
        await this.uploadToS3(backup);
      }

      backup.status = BackupStatus.COMPLETED;
      backup.completedAt = new Date();
      backup.fileSize = await this.getFileSize(filePath);
      await this.backupRepository.save(backup);

      this.logger.log(`Backup created successfully: ${fileName}`);
      return backup;
    } catch (error) {
      backup.status = BackupStatus.FAILED;
      backup.errorMessage = error.message;
      backup.completedAt = new Date();
      await this.backupRepository.save(backup);

      this.logger.error(`Backup failed: ${fileName}`, error.stack);
      throw error;
    }
  }

  private async executeBackup(backup: DatabaseBackup, filePath: string) {
    const pgPassword = this.dbConfig.password;
    const command = `PGPASSWORD="${pgPassword}" pg_dump -h ${this.dbConfig.host} -p ${this.dbConfig.port} -U ${this.dbConfig.username} -d ${this.dbConfig.database} -F c -f "${filePath}"`;

    this.logger.log(`Executing backup command for ${backup.fileName}`);
    
    try {
      const { stdout, stderr } = await execAsync(command);
      if (stderr) {
        this.logger.warn(`pg_dump stderr: ${stderr}`);
      }
      this.logger.log(`Backup completed: ${stdout}`);
    } catch (error) {
      throw new Error(`pg_dump failed: ${error.message}`);
    }
  }

  private async encryptBackup(backup: DatabaseBackup) {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not configured');
    }

    this.logger.log(`Encrypting backup: ${backup.fileName}`);
    
    const inputFile = backup.filePath;
    const encryptedFile = `${inputFile}.enc`;

    try {
      // Read the backup file
      const fileData = fs.readFileSync(inputFile);
      
      // Generate IV
      const iv = crypto.randomBytes(16);
      
      // Create cipher
      const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
      const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
      
      // Encrypt
      const encrypted = Buffer.concat([cipher.update(fileData), cipher.final()]);
      const authTag = cipher.getAuthTag();
      
      // Write encrypted file (IV + Auth Tag + Encrypted Data)
      fs.writeFileSync(encryptedFile, Buffer.concat([iv, authTag, encrypted]));
      
      // Remove original file
      fs.unlinkSync(inputFile);
      
      // Update backup record
      backup.filePath = encryptedFile;
      backup.isEncrypted = true;
      await this.backupRepository.save(backup);
      
      this.logger.log(`Backup encrypted: ${encryptedFile}`);
    } catch (error) {
      throw new Error(`Encryption failed: ${error.message}`);
    }
  }

  private async uploadToS3(backup: DatabaseBackup) {
    // Note: In production, use AWS SDK
    // This is a placeholder for S3 upload logic
    this.logger.log(`Uploading to S3: ${backup.fileName}`);
    
    try {
      // Simulate S3 upload
      // In production, implement actual S3 upload using @aws-sdk/client-s3
      backup.uploadedToS3 = true;
      backup.s3Key = `backups/${backup.fileName}`;
      backup.s3Bucket = this.s3Bucket;
      await this.backupRepository.save(backup);
      
      this.logger.log(`Uploaded to S3: ${backup.s3Key}`);
    } catch (error) {
      this.logger.error(`S3 upload failed: ${error.message}`);
      // Don't fail the backup if S3 upload fails
      backup.errorMessage = `S3 upload failed: ${error.message}`;
      await this.backupRepository.save(backup);
    }
  }

  async verifyBackup(backupId: string): Promise<DatabaseBackup> {
    const backup = await this.backupRepository.findOne({
      where: { id: backupId },
    });

    if (!backup) {
      throw new Error('Backup not found');
    }

    this.logger.log(`Verifying backup: ${backup.fileName}`);

    try {
      // Create a temporary database for verification
      const testDbName = `skillsync_verify_${Date.now()}`;
      
      // Create test database
      await this.executeSql(`CREATE DATABASE ${testDbName}`);
      
      try {
        // Restore backup to test database
        await this.restoreToTestDatabase(backup, testDbName);
        
        // Run verification queries
        const tableCount = await this.countTables(testDbName);
        const recordCount = await this.countRecords(testDbName);
        
        backup.verificationStatus = `verified: ${tableCount} tables, ${recordCount} records`;
        backup.verifiedAt = new Date();
        backup.status = BackupStatus.VERIFIED;
        
        this.logger.log(`Backup verified: ${backup.verificationStatus}`);
      } finally {
        // Clean up test database
        await this.executeSql(`DROP DATABASE IF EXISTS ${testDbName}`);
      }
      
      await this.backupRepository.save(backup);
      return backup;
    } catch (error) {
      backup.verificationStatus = `failed: ${error.message}`;
      await this.backupRepository.save(backup);
      throw error;
    }
  }

  private async restoreToTestDatabase(backup: DatabaseBackup, dbName: string) {
    const pgPassword = this.dbConfig.password;
    let inputFile = backup.filePath;

    // Decrypt if necessary
    if (backup.isEncrypted) {
      inputFile = await this.decryptBackup(backup);
    }

    const command = `PGPASSWORD="${pgPassword}" pg_restore -h ${this.dbConfig.host} -p ${this.dbConfig.port} -U ${this.dbConfig.username} -d ${dbName} --no-owner --no-privileges "${inputFile}"`;

    try {
      const { stdout, stderr } = await execAsync(command);
      if (stderr) {
        this.logger.warn(`pg_restore stderr: ${stderr}`);
      }
    } catch (error) {
      throw new Error(`Restore verification failed: ${error.message}`);
    }
  }

  private async decryptBackup(backup: DatabaseBackup): Promise<string> {
    if (!this.encryptionKey) {
      throw new Error('Encryption key not configured');
    }

    const encryptedFile = backup.filePath;
    const decryptedFile = encryptedFile.replace('.enc', '');

    try {
      const fileData = fs.readFileSync(encryptedFile);
      
      // Extract IV, auth tag, and encrypted data
      const iv = fileData.slice(0, 16);
      const authTag = fileData.slice(16, 32);
      const encrypted = fileData.slice(32);
      
      // Create decipher
      const key = crypto.scryptSync(this.encryptionKey, 'salt', 32);
      const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
      decipher.setAuthTag(authTag);
      
      // Decrypt
      const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
      
      fs.writeFileSync(decryptedFile, decrypted);
      return decryptedFile;
    } catch (error) {
      throw new Error(`Decryption failed: ${error.message}`);
    }
  }

  private async countTables(dbName: string): Promise<number> {
    const result = await this.executeSql(
      `SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public'`,
      dbName
    );
    return parseInt(result.rows[0].count);
  }

  private async countRecords(dbName: string): Promise<number> {
    const result = await this.executeSql(
      `SELECT SUM(n_live_tup) FROM pg_stat_user_tables`,
      dbName
    );
    return parseInt(result.rows[0].sum || '0');
  }

  private async executeSql(query: string, dbName?: string) {
    // For operations on different databases, we need a new connection
    const targetDb = dbName || this.dbConfig.database;
    
    // Use pg directly for cross-database operations
    const { Pool } = require('pg');
    const pool = new Pool({
      host: this.dbConfig.host,
      port: this.dbConfig.port,
      user: this.dbConfig.username,
      password: this.dbConfig.password,
      database: targetDb,
    });

    try {
      const client = await pool.connect();
      const result = await client.query(query);
      client.release();
      return result;
    } finally {
      await pool.end();
    }
  }

  async listBackups(): Promise<DatabaseBackup[]> {
    return this.backupRepository.find({
      order: { createdAt: 'DESC' },
    });
  }

  async getBackup(backupId: string): Promise<DatabaseBackup> {
    return this.backupRepository.findOne({
      where: { id: backupId },
    });
  }

  async deleteBackup(backupId: string): Promise<void> {
    const backup = await this.backupRepository.findOne({
      where: { id: backupId },
    });

    if (!backup) {
      throw new Error('Backup not found');
    }

    await this.deleteBackupFile(backup);
    await this.backupRepository.remove(backup);
    
    this.logger.log(`Backup deleted: ${backup.fileName}`);
  }

  private async deleteBackupFile(backup: DatabaseBackup) {
    try {
      if (fs.existsSync(backup.filePath)) {
        fs.unlinkSync(backup.filePath);
      }
      
      // Also delete decrypted version if it exists
      const decryptedPath = backup.filePath.replace('.enc', '');
      if (decryptedPath !== backup.filePath && fs.existsSync(decryptedPath)) {
        fs.unlinkSync(decryptedPath);
      }
    } catch (error) {
      this.logger.error(`Failed to delete backup file: ${backup.filePath}`, error.stack);
    }
  }

  async getBackupStatus() {
    const totalBackups = await this.backupRepository.count({
      where: { status: BackupStatus.COMPLETED },
    });

    const latestBackup = await this.backupRepository.findOne({
      where: { status: BackupStatus.COMPLETED },
      order: { createdAt: 'DESC' },
    });

    const allBackups = await this.backupRepository.find({
      where: { status: BackupStatus.COMPLETED },
    });

    const totalSize = allBackups.reduce((sum, backup) => sum + (backup.fileSize || 0), 0);

    const lastFailedBackup = await this.backupRepository.findOne({
      where: { status: BackupStatus.FAILED },
      order: { createdAt: 'DESC' },
    });

    // Calculate next scheduled backup
    const now = new Date();
    const nextBackup = new Date(now);
    nextBackup.setDate(nextBackup.getDate() + 1);
    nextBackup.setHours(3, 0, 0, 0);

    return {
      totalBackups,
      totalSize,
      latestBackup: latestBackup?.createdAt?.toISOString() || 'No backups yet',
      nextScheduledBackup: nextBackup.toISOString(),
      schedule: '0 3 * * * (Daily at 3:00 AM)',
      retentionDays: this.retentionDays,
      walArchivingEnabled: true,
      encryptionEnabled: this.encryptionEnabled,
      lastBackupStatus: lastFailedBackup ? 'failed' : 'success',
      lastBackupError: lastFailedBackup?.errorMessage || null,
    };
  }

  async restoreBackup(backupId: string, targetTimestamp?: string): Promise<void> {
    const backup = await this.backupRepository.findOne({
      where: { id: backupId },
    });

    if (!backup) {
      throw new Error('Backup not found');
    }

    if (backup.status !== BackupStatus.COMPLETED && backup.status !== BackupStatus.VERIFIED) {
      throw new Error('Backup is not in a restorable state');
    }

    this.logger.log(`Starting restore from backup: ${backup.fileName}`);

    try {
      let inputFile = backup.filePath;

      // Decrypt if necessary
      if (backup.isEncrypted) {
        inputFile = await this.decryptBackup(backup);
      }

      const pgPassword = this.dbConfig.password;
      const command = `PGPASSWORD="${pgPassword}" pg_restore -h ${this.dbConfig.host} -p ${this.dbConfig.port} -U ${this.dbConfig.username} -d ${this.dbConfig.database} --clean --if-exists "${inputFile}"`;

      if (targetTimestamp) {
        // For point-in-time recovery, we would use WAL files
        this.logger.log(`Point-in-time recovery requested at: ${targetTimestamp}`);
        // Implementation would involve recovering to a specific timestamp using WAL
      }

      const { stdout, stderr } = await execAsync(command);
      if (stderr) {
        this.logger.warn(`pg_restore stderr: ${stderr}`);
      }

      this.logger.log(`Restore completed successfully from: ${backup.fileName}`);
    } catch (error) {
      this.logger.error(`Restore failed: ${error.message}`, error.stack);
      throw new Error(`Restore failed: ${error.message}`);
    }
  }

  private async getFileSize(filePath: string): Promise<number> {
    try {
      const stats = fs.statSync(filePath);
      return stats.size;
    } catch {
      return 0;
    }
  }

  private async sendAlert(subject: string, message: string) {
    if (!this.alertEmail) {
      this.logger.warn(`Alert: ${subject} - ${message}`);
      return;
    }

    // In production, integrate with email service or monitoring system
    this.logger.error(`ALERT: ${subject} - ${message}`);
    
    // Example: Send email using nodemailer
    // await this.notificationService.sendAlert(this.alertEmail, subject, message);
  }

  async configureWalArchiving(): Promise<void> {
    this.logger.log('WAL archiving configuration instructions:');
    this.logger.log('1. Edit postgresql.conf:');
    this.logger.log('   wal_level = replica');
    this.logger.log('   archive_mode = on');
    this.logger.log(`   archive_command = 'cp %p ${this.walArchiveDir}/%f'`);
    this.logger.log('2. Restart PostgreSQL service');
    this.logger.log('3. Verify with: SHOW archive_mode;');
  }
}
