/** Reads one environment variable; `process.env[key]` or a ConfigService adapter. */
export type EnvReader = (key: string) => string | undefined;

/** DI token for the resolved backup configuration. */
export const BACKUP_CONFIG = 'BACKUP_CONFIG';

/** Directory the scheduled job writes local artefacts and its status file into. */
export const DEFAULT_BACKUP_DIR = '/var/lib/skillsync/backups';
export const DEFAULT_RETENTION_DAYS = 30;
/** A daily backup is considered stale once it is older than 26 hours. */
export const DEFAULT_MAX_AGE_HOURS = 26;
export const DEFAULT_S3_PREFIX = 'postgres';
export const DEFAULT_S3_REGION = 'us-east-1';
/** Daily at 02:00 (server local time). */
export const DEFAULT_SCHEDULE_CRON = '0 2 * * *';

export interface BackupConfig {
  /** Absolute path the backup script writes its machine-readable status to. */
  statusFile: string;
  /** Local directory holding the backup artefacts (mirror of the S3 bucket). */
  backupDir: string;
  /** Offsite S3 bucket; when unset the strategy is local-only. */
  s3Bucket?: string;
  s3Prefix: string;
  s3Region: string;
  /** Age in hours after which the last successful backup counts as stale. */
  maxAgeHours: number;
  /** How long backups and WAL segments are kept before pruning. */
  retentionDays: number;
  encryptionEnabled: boolean;
  pointInTimeRecoveryEnabled: boolean;
  /** Cron expression describing the automated backup schedule. */
  scheduleCron: string;
}

function readInt(read: EnvReader, key: string, fallback: number): number {
  const raw = read(key);
  if (raw === undefined || raw.trim() === '') return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < 1) {
    throw new Error(`${key} must be a positive integer, got "${raw}"`);
  }
  return value;
}

function readBool(read: EnvReader, key: string, fallback: boolean): boolean {
  const raw = read(key)?.trim().toLowerCase();
  if (raw === undefined || raw === '') return fallback;
  return raw === 'true' || raw === '1';
}

/**
 * Reads the backup strategy settings. Defaults match the shell tooling in
 * `scripts/backup` so the API reports exactly what the scheduled job does.
 */
export function buildBackupConfig(read: EnvReader): BackupConfig {
  const backupDir = read('BACKUP_DIR') ?? DEFAULT_BACKUP_DIR;
  const statusFile =
    read('BACKUP_STATUS_FILE') ?? `${backupDir}/backup-status.json`;
  const bucket = read('BACKUP_S3_BUCKET')?.trim();

  return {
    statusFile,
    backupDir,
    s3Bucket: bucket ? bucket : undefined,
    s3Prefix: read('BACKUP_S3_PREFIX') ?? DEFAULT_S3_PREFIX,
    s3Region: read('BACKUP_S3_REGION') ?? DEFAULT_S3_REGION,
    maxAgeHours: readInt(read, 'BACKUP_MAX_AGE_HOURS', DEFAULT_MAX_AGE_HOURS),
    retentionDays: readInt(
      read,
      'BACKUP_RETENTION_DAYS',
      DEFAULT_RETENTION_DAYS,
    ),
    encryptionEnabled: readBool(read, 'BACKUP_ENCRYPTION_ENABLED', true),
    pointInTimeRecoveryEnabled: readBool(read, 'BACKUP_PITR_ENABLED', true),
    scheduleCron: read('BACKUP_SCHEDULE_CRON') ?? DEFAULT_SCHEDULE_CRON,
  };
}
