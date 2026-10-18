import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum ReportStatus {
  OPEN = 'open',
  RESOLVED = 'resolved',
  DISMISSED = 'dismissed',
}

@Entity('content_reports')
@Index('IDX_content_reports_status', ['status', 'createdAt'])
export class ContentReport {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'reporter_id', type: 'uuid' })
  reporterId!: string;

  @Column({ name: 'target_type', type: 'varchar', length: 50 })
  targetType!: string;

  @Column({ name: 'target_id', type: 'varchar', length: 100 })
  targetId!: string;

  @Column({ type: 'varchar', length: 1000 })
  reason!: string;

  @Column({ type: 'enum', enum: ReportStatus, enumName: 'content_reports_status_enum', default: ReportStatus.OPEN })
  status!: ReportStatus;

  @Column({ name: 'resolved_by', type: 'uuid', nullable: true })
  resolvedBy!: string | null;

  @Column({ name: 'resolution_note', type: 'varchar', length: 1000, nullable: true })
  resolutionNote!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt!: Date | null;
}
