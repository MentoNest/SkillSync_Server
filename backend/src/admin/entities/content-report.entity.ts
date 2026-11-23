import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum ReportStatus {
  OPEN = 'open',
  RESOLVED = 'resolved',
  DISMISSED = 'dismissed',
}

export enum ReportTargetType {
  USER = 'user',
  SESSION = 'session',
  PROFILE = 'profile',
  MESSAGE = 'message',
}

@Entity('content_reports')
@Index('idx_content_reports_status_created', ['status', 'createdAt'])
@Index('idx_content_reports_reporter_created', ['reporterId', 'createdAt'])
@Index('idx_content_reports_target', ['targetType', 'targetId'])
export class ContentReport {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'reporter_id', type: 'varchar', length: 56 })
  reporterId!: string;

  @Column({ name: 'target_type', type: 'varchar', length: 50 })
  targetType!: ReportTargetType;

  @Column({ name: 'target_id', type: 'varchar', length: 100 })
  targetId!: string;

  @Column({ type: 'varchar', length: 1000 })
  reason!: string;

  @Column({ type: 'varchar', length: 24, default: ReportStatus.OPEN })
  status!: ReportStatus;

  @Column({ name: 'resolved_by', type: 'varchar', length: 56, nullable: true })
  resolvedBy!: string | null;

  @Column({
    name: 'resolution_note',
    type: 'varchar',
    length: 1000,
    nullable: true,
  })
  resolutionNote!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt!: Date | null;

  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;
}
