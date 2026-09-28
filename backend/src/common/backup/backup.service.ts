import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';

const execAsync = promisify(exec);
const fsAsync = fs.promises;

export interface BackupConfig {
  host: string;
  port: number;
  username: string;
  password: string;
  database: string;
  backupDir: string;
  retentionDays: number;
  enableEncryption: boolean;
  encryptionKey?: string;
  s3Bucket?: string;
  s3Region?: string;
}

export interface BackupManifest {
  id: string;
  timestamp: Date;
  filename: string;
  size: number;
  checksum: string;
  encrypted: boolean;
  type: 'full' | 'incremental';
  walPosition?: string;
  status: 'completed' | 'failed' | 'in_progress';
  error?: string;
}

export interface RestoreOptions {
  backupId: string;
  targetDatabase?: string;
  pointInTime?: Date;
}

@Injectable()
export class BackupService implements OnModuleDestroy {
  private readonly logger = new Logger(BackupService.name);
  private readonly config: BackupConfig;
  private backupInterval: NodeJS.Timeout | null = null;
  private readonly manifests: BackupManifest[] = [];

  constructor() {
    this.config = {
      host: process.env.DB_HOST || 'localhost',
      port: parseInt(process.env.DB_PORT || '5432', 10),
      username: process.env.DB_USERNAME || 'postgres',
      password: process.env.DB_PASSWORD || 'password',
      database: process.env.DB_DATABASE || 'skillsync',
      backupDir: process.env.BACKUP_DIR || './backups',
      retentionDays: parseInt(process.env.BACKUP_RETENTION_DAYS || '30', 10),
      enableEncryption: process.env.BACKUP_ENCRYPTION === 'true',
      encryptionKey: process.env.BACKUP_ENCRYPTION_KEY,
      s3Bucket: process.env.AWS_S3_BACKUP_BUCKET,
      s3Region: process.env.AWS_S3_REGION,
    };

    this.ensureBackupDir();
  }

  /**
   * Start automated daily backups
   */
  startAutomatedBackups(): void {
    if (this.backupInterval) {
      this.logger.warn('Automated backups already running');
      return;
    }

    const intervalMs = 24 * 60 * 60 * 1000; // 24 hours
    this.backupInterval = setInterval(() => {
      this.createFullBackup().catch((err) => {
        this.logger.error('Automated backup failed', err);
      });
    }, intervalMs);

    this.logger.log('Automated daily backups started');
  }

  /**
   * Stop automated backups
   */
  stopAutomatedBackups(): void {
    if (this.backupInterval) {
      clearInterval(this.backupInterval);
      this.backupInterval = null;
      this.logger.log('Automated backups stopped');
    }
  }

  /**
   * Create a full database backup using pg_dump
   */
  async createFullBackup(): Promise<BackupManifest> {
    const backupId = crypto.randomUUID();
    const timestamp = new Date();
    const filename = `backup_${timestamp.toISOString().replace(/[:.]/g, '-')}_${backupId}.dump`;
    const filepath = path.join(this.config.backupDir, filename);

    this.logger.log(`Starting full backup: ${backupId}`);

    const manifest: BackupManifest = {
      id: backupId,
      timestamp,
      filename,
      size: 0,
      checksum: '',
      encrypted: false,
      type: 'full',
      status: 'in_progress',
    };

    this.manifests.push(manifest);

    try {
      // Set password for pg_dump
      const env = {
        ...process.env,
        PGPASSWORD: this.config.password,
      };

      // Create backup using pg_dump
      const dumpCommand = [
        'pg_dump',
        `-h ${this.config.host}`,
        `-p ${this.config.port}`,
        `-U ${this.config.username}`,
        `-d ${this.config.database}`,
        '-F c', // Custom format
        '-v', // Verbose
        `-f "${filepath}"`,
        '--no-owner',
        '--no-privileges',
      ].join(' ');

      await execAsync(dumpCommand, { env, timeout: 300000 }); // 5 min timeout

      // Get file stats
      const stats = await fsAsync.stat(filepath);
      manifest.size = stats.size;

      // Calculate checksum
      manifest.checksum = await this.calculateChecksum(filepath);

      // Encrypt if enabled
      if (this.config.enableEncryption && this.config.encryptionKey) {
        await this.encryptFile(filepath);
        manifest.encrypted = true;
      }

      // Upload to S3 if configured
      if (this.config.s3Bucket) {
        await this.uploadToS3(filepath, filename);
      }

      manifest.status = 'completed';
      this.logger.log(`Backup completed: ${backupId} (${manifest.size} bytes)`);

      // Cleanup old backups
      await this.cleanupOldBackups();
    } catch (error) {
      manifest.status = 'failed';
      manifest.error = error instanceof Error ? error.message : 'Unknown error';
      this.logger.error(`Backup failed: ${backupId}`, error);
    }

    return manifest;
  }

  /**
   * Restore from a backup
   */
  async restoreFromBackup(options: RestoreOptions): Promise<void> {
    const manifest = this.manifests.find((m) => m.id === options.backupId);
    if (!manifest) {
      throw new Error(`Backup not found: ${options.backupId}`);
    }

    if (manifest.status !== 'completed') {
      throw new Error(`Backup is not in completed state: ${manifest.status}`);
    }

    const targetDb = options.targetDatabase || this.config.database;
    const filepath = path.join(this.config.backupDir, manifest.filename);

    this.logger.log(`Restoring backup ${options.backupId} to ${targetDb}`);

    try {
      // Decrypt if needed
      if (manifest.encrypted && this.config.encryptionKey) {
        await this.decryptFile(filepath);
      }

      // Restore using pg_restore
      const env = {
        ...process.env,
        PGPASSWORD: this.config.password,
      };

      const restoreCommand = [
        'pg_restore',
        `-h ${this.config.host}`,
        `-p ${this.config.port}`,
        `-U ${this.config.username}`,
        `-d ${targetDb}`,
        '-v',
        '--no-owner',
        '--no-privileges',
        '--clean',
        '--if-exists',
        `"${filepath}"`,
      ].join(' ');

      await execAsync(restoreCommand, { env, timeout: 600000 }); // 10 min timeout

      this.logger.log(`Restore completed for backup ${options.backupId}`);
    } catch (error) {
      this.logger.error(`Restore failed for backup ${options.backupId}`, error);
      throw error;
    }
  }

  /**
   * Verify backup integrity
   */
  async verifyBackup(backupId: string): Promise<boolean> {
    const manifest = this.manifests.find((m) => m.id === backupId);
    if (!manifest) {
      return false;
    }

    const filepath = path.join(this.config.backupDir, manifest.filename);

    try {
      // Check file exists
      await fsAsync.access(filepath);

      // Verify checksum
      const currentChecksum = await this.calculateChecksum(filepath);
      if (currentChecksum !== manifest.checksum) {
        this.logger.error(`Checksum mismatch for backup ${backupId}`);
        return false;
      }

      // Try to list contents (non-destructive check)
      const env = {
        ...process.env,
        PGPASSWORD: this.config.password,
      };

      await execAsync(
        `pg_restore --list "${filepath}"`,
        { env, timeout: 30000 },
      );

      return true;
    } catch (error) {
      this.logger.error(`Backup verification failed: ${backupId}`, error);
      return false;
    }
  }

  /**
   * Get backup status endpoint data
   */
  getBackupStatus(): {
    lastBackup?: BackupManifest;
    totalBackups: number;
    oldestBackup?: Date;
    newestBackup?: Date;
    totalSize: number;
    retentionDays: number;
  } {
    const completed = this.manifests.filter((m) => m.status === 'completed');
    return {
      lastBackup: completed[completed.length - 1],
      totalBackups: completed.length,
      oldestBackup: completed[0]?.timestamp,
      newestBackup: completed[completed.length - 1]?.timestamp,
      totalSize: completed.reduce((sum, m) => sum + m.size, 0),
      retentionDays: this.config.retentionDays,
    };
  }

  /**
   * Cleanup backups older than retention period
   */
  private async cleanupOldBackups(): Promise<void> {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - this.config.retentionDays);

    const toDelete = this.manifests.filter(
      (m) => m.timestamp < cutoff && m.status === 'completed',
    );

    for (const manifest of toDelete) {
      try {
        const filepath = path.join(this.config.backupDir, manifest.filename);
        await fsAsync.unlink(filepath).catch(() => {});
        const index = this.manifests.indexOf(manifest);
        if (index > -1) {
          this.manifests.splice(index, 1);
        }
        this.logger.log(`Cleaned up old backup: ${manifest.id}`);
      } catch (error) {
        this.logger.warn(`Failed to cleanup backup ${manifest.id}`, error);
      }
    }
  }

  /**
   * Calculate file checksum
   */
  private async calculateChecksum(filepath: string): Promise<string> {
    const fileBuffer = await fsAsync.readFile(filepath);
    return crypto.createHash('sha256').update(fileBuffer).digest('hex');
  }

  /**
   * Encrypt backup file
   */
  private async encryptFile(filepath: string): Promise<void> {
    if (!this.config.encryptionKey) {
      throw new Error('Encryption key not configured');
    }

    const key = Buffer.from(this.config.encryptionKey, 'hex');
    const iv = crypto.randomBytes(16);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    const data = await fsAsync.readFile(filepath);
    const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
    const tag = cipher.getAuthTag();

    // Write encrypted file with IV and tag prepended
    const encryptedData = Buffer.concat([iv, tag, encrypted]);
    await fsAsync.writeFile(filepath + '.enc', encryptedData);

    // Remove original
    await fsAsync.unlink(filepath);
  }

  /**
   * Decrypt backup file
   */
  private async decryptFile(filepath: string): Promise<void> {
    if (!this.config.encryptionKey) {
      throw new Error('Encryption key not configured');
    }

    const key = Buffer.from(this.config.encryptionKey, 'hex');
    const encryptedData = await fsAsync.readFile(filepath);

    const iv = encryptedData.subarray(0, 16);
    const tag = encryptedData.subarray(16, 32);
    const data = encryptedData.subarray(32);

    const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(tag);

    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    await fsAsync.writeFile(filepath.replace('.enc', ''), decrypted);
  }

  /**
   * Upload to S3
   */
  private async uploadToS3(filepath: string, filename: string): Promise<void> {
    if (!this.config.s3Bucket) return;

    // AWS SDK would be used here in production
    this.logger.log(`S3 upload placeholder: ${filename} to ${this.config.s3Bucket}`);
  }

  /**
   * Ensure backup directory exists
   */
  private async ensureBackupDir(): Promise<void> {
    try {
      await fsAsync.access(this.config.backupDir);
    } catch {
      await fsAsync.mkdir(this.config.backupDir, { recursive: true });
    }
  }

  onModuleDestroy() {
    this.stopAutomatedBackups();
  }
}
