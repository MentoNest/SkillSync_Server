import { Inject, Injectable, Logger } from '@nestjs/common';
import { readFile } from 'node:fs/promises';
import { BACKUP_CONFIG, BackupConfig } from './backup.config';
import {
  BackupHealth,
  BackupRunStatus,
  BackupRunSummaryDto,
  BackupStatusDto,
} from './dto/backup-status.dto';

/** Shape written by `scripts/backup/backup.sh`; every field is optional on read. */
interface RawBackupRun {
  status?: string;
  startedAt?: string;
  finishedAt?: string | null;
  durationMs?: number | null;
  sizeBytes?: number | null;
  encrypted?: boolean;
  uploadedToS3?: boolean;
  location?: string | null;
  checksum?: string | null;
  error?: string | null;
}

/**
 * Reports the health of the automated PostgreSQL backup strategy to admins by
 * reading the machine-readable status file the scheduled job writes after every
 * run. It never reaches into S3 directly, so it is safe to call on every poll.
 */
@Injectable()
export class BackupService {
  private readonly logger = new Logger(BackupService.name);

  constructor(@Inject(BACKUP_CONFIG) private readonly config: BackupConfig) {}

  /** Builds the status snapshot. A missing or corrupt status file yields `not_configured`. */
  async getStatus(now: Date = new Date()): Promise<BackupStatusDto> {
    const lastBackup = await this.readLastRun();
    const lastBackupAgeHours = lastBackup ? this.ageHours(lastBackup, now) : null;

    return {
      health: this.evaluate(lastBackup, lastBackupAgeHours),
      checkedAt: now.toISOString(),
      lastBackup,
      lastBackupAgeHours,
      maxAgeHours: this.config.maxAgeHours,
      retentionDays: this.config.retentionDays,
      encryptionEnabled: this.config.encryptionEnabled,
      pointInTimeRecoveryEnabled: this.config.pointInTimeRecoveryEnabled,
      scheduleCron: this.config.scheduleCron,
      storage: {
        provider: this.config.s3Bucket ? 's3' : 'local',
        bucket: this.config.s3Bucket ?? null,
        prefix: this.config.s3Prefix,
        region: this.config.s3Region,
      },
    };
  }

  private async readLastRun(): Promise<BackupRunSummaryDto | null> {
    let raw: string;
    try {
      raw = await readFile(this.config.statusFile, 'utf8');
    } catch (error) {
      const code = (error as NodeJS.ErrnoException).code;
      if (code !== 'ENOENT') {
        this.logger.warn(
          `Unable to read backup status file "${this.config.statusFile}": ${code ?? String(error)}`,
        );
      }
      return null;
    }

    try {
      return this.normalize(JSON.parse(raw) as RawBackupRun);
    } catch {
      this.logger.warn(`Backup status file "${this.config.statusFile}" is not valid JSON`);
      return null;
    }
  }

  private normalize(run: RawBackupRun): BackupRunSummaryDto | null {
    const finishedAt = this.toIso(run.finishedAt);
    const startedAt = this.toIso(run.startedAt) ?? finishedAt;
    if (!startedAt) return null;

    return {
      status: this.toStatus(run.status),
      startedAt,
      finishedAt,
      durationMs: this.toNumber(run.durationMs),
      sizeBytes: this.toNumber(run.sizeBytes),
      encrypted: run.encrypted === true,
      uploadedToS3: run.uploadedToS3 === true,
      location: run.location ?? null,
      checksum: run.checksum ?? null,
      error: run.error ?? null,
    };
  }

  private ageHours(run: BackupRunSummaryDto, now: Date): number | null {
    const time = Date.parse(run.finishedAt ?? run.startedAt);
    if (!Number.isFinite(time)) return null;
    return Math.round(((now.getTime() - time) / 3_600_000) * 100) / 100;
  }

  private evaluate(run: BackupRunSummaryDto | null, ageHours: number | null): BackupHealth {
    if (!run) return 'not_configured';
    if (run.status === 'failed') return 'failing';
    if (ageHours === null) return 'not_configured';
    return ageHours > this.config.maxAgeHours ? 'stale' : 'healthy';
  }

  private toStatus(value: string | undefined): BackupRunStatus {
    return value === 'failed' || value === 'running' ? value : 'success';
  }

  private toNumber(value: unknown): number | null {
    return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
  }

  private toIso(value: unknown): string | null {
    if (typeof value !== 'string') return null;
    const time = Date.parse(value);
    return Number.isFinite(time) ? new Date(time).toISOString() : null;
  }
}
