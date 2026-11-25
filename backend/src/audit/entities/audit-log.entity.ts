import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

export enum AuditEvent {
  USER_SUSPENDED = 'user_suspended',
  USER_UNSUSPENDED = 'user_unsuspended',
  USER_SUSPENSION_EXPIRED = 'user_suspension_expired',
  USER_STATUS_CHANGED = 'user_status_changed',
  USER_DELETED = 'user_deleted',
  USER_RESTORED = 'user_restored',
  ROLE_ASSIGNED = 'role_assigned',
  SESSION_CANCELLED = 'session_cancelled',
  DISPUTE_RESOLVED = 'dispute_resolved',
  REPORT_CREATED = 'report_created',
  REPORT_RESOLVED = 'report_resolved',
  REPORT_ACTION_TAKEN = 'report_action_taken',
  REPORT_DELETED = 'report_deleted',
  REPORT_RESTORED = 'report_restored',
}

@Entity('audit_logs')
@Index('idx_audit_logs_event_created', ['event', 'createdAt'])
@Index('idx_audit_logs_wallet_created', ['walletAddress', 'createdAt'])
@Index('idx_audit_logs_target_created', ['targetId', 'createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 64 })
  event!: AuditEvent;

  @Column({
    name: 'wallet_address',
    type: 'varchar',
    length: 56,
    nullable: true,
  })
  walletAddress!: string | null;

  @Column({ name: 'target_id', type: 'varchar', length: 100, nullable: true })
  targetId!: string | null;

  @Column({ name: 'ip_address', type: 'varchar', length: 64, nullable: true })
  ipAddress!: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 255, nullable: true })
  userAgent!: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  metadata!: Record<string, unknown>;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}
