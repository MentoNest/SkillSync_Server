import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { promises as fs } from 'fs';

export interface BackupStatus {
  status: 'ok' | 'failed' | 'unknown';
  timestamp: string | null;
  file: string | null;
  message: string;
  /** True when the last backup is older than 26 hours (daily job missed). */
  stale: boolean;
}

const STALE_AFTER_MS = 26 * 60 * 60 * 1000;

/** Reads the status file written by scripts/backup/pg-backup.sh (issue #1482). */
@Injectable()
export class BackupStatusService {
  constructor(private readonly config: ConfigService) {}

  async getStatus(now: Date = new Date()): Promise<BackupStatus> {
    const path = this.config.get<string>('BACKUP_STATUS_FILE') ?? '/var/backups/skillsync/status.json';
    let raw: string;
    try {
      raw = await fs.readFile(path, 'utf8');
    } catch {
      return { status: 'unknown', timestamp: null, file: null, message: 'No backup status file found', stale: true };
    }

    try {
      const parsed = JSON.parse(raw) as Partial<BackupStatus>;
      const timestamp = parsed.timestamp ?? null;
      const age = timestamp ? now.getTime() - new Date(timestamp).getTime() : Infinity;
      return {
        status: parsed.status === 'ok' || parsed.status === 'failed' ? parsed.status : 'unknown',
        timestamp,
        file: parsed.file ?? null,
        message: parsed.message ?? '',
        stale: !(age < STALE_AFTER_MS),
      };
    } catch {
      return { status: 'unknown', timestamp: null, file: null, message: 'Status file is not valid JSON', stale: true };
    }
  }
}
