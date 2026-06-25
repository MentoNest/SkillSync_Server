import { Injectable, Logger } from '@nestjs/common';
import { readFile } from 'fs/promises';
import { existsSync } from 'fs';

export interface LastBackup {
  timestamp: string;
  database: string;
  s3Key: string;
  s3Bucket: string;
  status: 'success' | 'failure';
}

export interface BackupStatus {
  lastBackup: LastBackup | null;
  statusFileReadAt: string | null;
  nextScheduledBackup: string | null;
  retentionDays: number;
  statusFilePath: string;
}

@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);

  /** Path where backup.sh writes its status JSON. */
  private readonly statusFilePath: string =
    process.env.BACKUP_STATUS_FILE ??
    '/tmp/skillsync-backups/last_backup_status.json';

  private readonly retentionDays: number = parseInt(
    process.env.BACKUP_RETENTION_DAYS ?? '30',
    10,
  );

  async getStatus(): Promise<BackupStatus> {
    let lastBackup: LastBackup | null = null;
    let statusFileReadAt: string | null = null;

    if (existsSync(this.statusFilePath)) {
      try {
        const raw = await readFile(this.statusFilePath, 'utf8');
        const parsed = JSON.parse(raw) as {
          lastBackup: LastBackup;
          writtenAt: string;
        };
        lastBackup = parsed.lastBackup;
        statusFileReadAt = new Date().toISOString();
      } catch (err) {
        this.logger.warn(`Could not read backup status file: ${err}`);
      }
    }

    return {
      lastBackup,
      statusFileReadAt,
      nextScheduledBackup: this.getNextScheduledBackup(),
      retentionDays: this.retentionDays,
      statusFilePath: this.statusFilePath,
    };
  }

  /**
   * Returns the next UTC midnight (next daily run).
   * Adjust this if the cron schedule differs.
   */
  private getNextScheduledBackup(): string {
    const next = new Date();
    next.setUTCDate(next.getUTCDate() + 1);
    next.setUTCHours(2, 0, 0, 0); // 02:00 UTC daily
    return next.toISOString();
  }
}
