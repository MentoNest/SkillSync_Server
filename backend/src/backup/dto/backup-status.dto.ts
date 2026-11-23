import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

/** Outcome of the most recent backup run as recorded by the scheduled job. */
export type BackupRunStatus = 'success' | 'failed' | 'running';

/**
 * Overall assessment of the backup strategy for the admin dashboard.
 * - `healthy`: the latest run succeeded and is fresh.
 * - `stale`: the latest run succeeded but is older than `BACKUP_MAX_AGE_HOURS`.
 * - `failing`: the latest run failed.
 * - `not_configured`: no run has been recorded yet (or the status file is missing).
 */
export type BackupHealth = 'healthy' | 'stale' | 'failing' | 'not_configured';

export class BackupStorageDto {
  @ApiProperty({ enum: ['s3', 'local'], example: 's3', description: 'Where backups are stored offsite.' })
  provider!: 's3' | 'local';

  @ApiPropertyOptional({ nullable: true, example: 'skillsync-backups' })
  bucket!: string | null;

  @ApiProperty({ example: 'postgres' })
  prefix!: string;

  @ApiProperty({ example: 'us-east-1' })
  region!: string;
}

export class BackupRunSummaryDto {
  @ApiProperty({ enum: ['success', 'failed', 'running'], example: 'success' })
  status!: BackupRunStatus;

  @ApiProperty({ example: '2026-11-23T02:00:00.000Z', format: 'date-time' })
  startedAt!: string;

  @ApiPropertyOptional({ nullable: true, example: '2026-11-23T02:03:12.000Z', format: 'date-time' })
  finishedAt!: string | null;

  @ApiPropertyOptional({ nullable: true, example: 192_000, description: 'Wall-clock duration in milliseconds.' })
  durationMs!: number | null;

  @ApiPropertyOptional({ nullable: true, example: 12_345_678, description: 'Size of the encrypted artefact in bytes.' })
  sizeBytes!: number | null;

  @ApiProperty({ example: true, description: 'Whether the artefact was encrypted before upload.' })
  encrypted!: boolean;

  @ApiProperty({ example: true, description: 'Whether the artefact was uploaded to offsite storage.' })
  uploadedToS3!: boolean;

  @ApiPropertyOptional({ nullable: true, example: 's3://skillsync-backups/postgres/skillsync-2026-11-23T02-00-00.dump.gpg' })
  location!: string | null;

  @ApiPropertyOptional({ nullable: true, example: 'sha256:9f2c…', description: 'Checksum of the encrypted artefact.' })
  checksum!: string | null;

  @ApiPropertyOptional({ nullable: true, description: 'Failure reason when `status` is `failed`.' })
  error!: string | null;
}

export class BackupStatusDto {
  @ApiProperty({ enum: ['healthy', 'stale', 'failing', 'not_configured'], example: 'healthy' })
  health!: BackupHealth;

  @ApiProperty({ example: '2026-11-23T04:00:00.000Z', format: 'date-time' })
  checkedAt!: string;

  @ApiPropertyOptional({ type: BackupRunSummaryDto, nullable: true })
  lastBackup!: BackupRunSummaryDto | null;

  @ApiPropertyOptional({ nullable: true, example: 2.5, description: 'Age of the latest run in hours.' })
  lastBackupAgeHours!: number | null;

  @ApiProperty({ example: 26, description: 'Age in hours after which a backup is reported as stale.' })
  maxAgeHours!: number;

  @ApiProperty({ example: 30 })
  retentionDays!: number;

  @ApiProperty({ example: true })
  encryptionEnabled!: boolean;

  @ApiProperty({ example: true, description: 'Whether WAL archiving for point-in-time recovery is enabled.' })
  pointInTimeRecoveryEnabled!: boolean;

  @ApiProperty({ example: '0 2 * * *', description: 'Cron expression of the automated backup schedule.' })
  scheduleCron!: string;

  @ApiProperty({ type: BackupStorageDto })
  storage!: BackupStorageDto;
}
