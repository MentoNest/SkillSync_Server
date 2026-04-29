import { ApiProperty } from '@nestjs/swagger';
import { IsBoolean, IsNumber, IsOptional, IsString } from 'class-validator';

export class CreateBackupDto {
  @ApiProperty({
    description: 'Backup description or label',
    required: false,
    example: 'Manual backup before deployment',
  })
  @IsOptional()
  @IsString()
  description?: string;

  @ApiProperty({
    description: 'Include WAL files for point-in-time recovery',
    required: false,
    default: true,
  })
  @IsOptional()
  @IsBoolean()
  includeWal?: boolean;
}

export class RestoreBackupDto {
  @ApiProperty({
    description: 'Backup file name or ID to restore from',
    required: true,
    example: 'backup_2024_04_29_03_00_00.sql.gz',
  })
  @IsString()
  backupFile: string;

  @ApiProperty({
    description: 'Target timestamp for point-in-time recovery (ISO format)',
    required: false,
    example: '2024-04-29T10:30:00.000Z',
  })
  @IsOptional()
  @IsString()
  targetTimestamp?: string;

  @ApiProperty({
    description: 'Confirmation flag to prevent accidental restores',
    required: true,
  })
  @IsBoolean()
  confirm: boolean;
}

export class BackupStatusDto {
  @ApiProperty({ description: 'Total number of backups' })
  @IsNumber()
  totalBackups: number;

  @ApiProperty({ description: 'Total size of all backups in bytes' })
  @IsNumber()
  totalSize: number;

  @ApiProperty({ description: 'Date of the latest backup' })
  @IsString()
  latestBackup: string;

  @ApiProperty({ description: 'Next scheduled backup date' })
  @IsString()
  nextScheduledBackup: string;

  @ApiProperty({ description: 'Backup schedule (cron expression)' })
  @IsString()
  schedule: string;

  @ApiProperty({ description: 'Retention period in days' })
  @IsNumber()
  retentionDays: number;

  @ApiProperty({ description: 'Whether WAL archiving is enabled' })
  @IsBoolean()
  walArchivingEnabled: boolean;

  @ApiProperty({ description: 'Whether encryption is enabled' })
  @IsBoolean()
  encryptionEnabled: boolean;

  @ApiProperty({ description: 'Last backup status' })
  @IsString()
  lastBackupStatus: string;

  @ApiProperty({ description: 'Last backup error (if any)' })
  @IsString()
  @IsOptional()
  lastBackupError?: string;
}
