import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum BackupStatus {
  PENDING = 'pending',
  IN_PROGRESS = 'in_progress',
  COMPLETED = 'completed',
  FAILED = 'failed',
  VERIFIED = 'verified',
  DELETED = 'deleted',
}

export enum BackupType {
  AUTOMATED = 'automated',
  MANUAL = 'manual',
  SCHEDULED_VERIFICATION = 'scheduled_verification',
}

@Entity('database_backups')
export class DatabaseBackup {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({
    name: 'file_name',
    type: 'varchar',
    length: 500,
  })
  fileName: string;

  @Column({
    name: 'file_path',
    type: 'varchar',
    length: 1000,
  })
  filePath: string;

  @Column({
    name: 'file_size',
    type: 'bigint',
    default: 0,
  })
  fileSize: number;

  @Column({
    type: 'enum',
    enum: BackupType,
    default: BackupType.AUTOMATED,
  })
  type: BackupType;

  @Column({
    type: 'enum',
    enum: BackupStatus,
    default: BackupStatus.PENDING,
  })
  status: BackupStatus;

  @Column({
    name: 'description',
    type: 'text',
    nullable: true,
  })
  description: string;

  @Column({
    name: 'started_at',
    type: 'timestamp',
    nullable: true,
  })
  startedAt: Date;

  @Column({
    name: 'completed_at',
    type: 'timestamp',
    nullable: true,
  })
  completedAt: Date;

  @Column({
    name: 'error_message',
    type: 'text',
    nullable: true,
  })
  errorMessage: string;

  @Column({
    name: 'is_encrypted',
    type: 'boolean',
    default: false,
  })
  isEncrypted: boolean;

  @Column({
    name: 'includes_wal',
    type: 'boolean',
    default: false,
  })
  includesWal: boolean;

  @Column({
    name: 'wal_start_timestamp',
    type: 'timestamp',
    nullable: true,
  })
  walStartTimestamp: Date;

  @Column({
    name: 'wal_end_timestamp',
    type: 'timestamp',
    nullable: true,
  })
  walEndTimestamp: Date;

  @Column({
    name: 'retention_until',
    type: 'timestamp',
  })
  retentionUntil: Date;

  @Column({
    name: 'verification_status',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  verificationStatus: string;

  @Column({
    name: 'verified_at',
    type: 'timestamp',
    nullable: true,
  })
  verifiedAt: Date;

  @Column({
    name: 'uploaded_to_s3',
    type: 'boolean',
    default: false,
  })
  uploadedToS3: boolean;

  @Column({
    name: 's3_key',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  s3Key: string;

  @Column({
    name: 's3_bucket',
    type: 'varchar',
    length: 255,
    nullable: true,
  })
  s3Bucket: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
