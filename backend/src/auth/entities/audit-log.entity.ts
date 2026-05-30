import { randomUUID } from 'crypto';
import { BeforeInsert, Column, Entity, Index, PrimaryColumn } from 'typeorm';

export enum AuditEventType {
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILURE = 'LOGIN_FAILURE',
  LOGOUT = 'LOGOUT',
  REFRESH_TOKEN_SUCCESS = 'REFRESH_TOKEN_SUCCESS',
  REFRESH_TOKEN_FAILURE = 'REFRESH_TOKEN_FAILURE',
  PASSWORD_EQUIVALENT_CHANGED = 'PASSWORD_EQUIVALENT_CHANGED',
  ROLE_ASSIGNED = 'ROLE_ASSIGNED',
  SUSPEND_USER = 'SUSPEND_USER',
  UNSUSPEND_USER = 'UNSUSPEND_USER',
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
  USERNAME_CHANGED = 'USERNAME_CHANGED',
}

@Entity({ name: 'audit_logs' })
@Index(['userId'])
@Index(['eventType'])
@Index(['timestamp'])
export class AuditLog {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'varchar', length: 128, nullable: true })
  userId!: string | null;

  @Column({ name: 'event_type', type: 'varchar', length: 64 })
  eventType!: AuditEventType;

  @Column({ name: 'timestamp', type: 'timestamptz', default: () => 'now()' })
  timestamp!: Date;

  @Column({ name: 'ip_address', type: 'varchar', length: 64, nullable: true })
  ipAddress!: string | null;

  @Column({ name: 'user_agent', type: 'text', nullable: true })
  userAgent!: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  details!: Record<string, unknown>;

  @Column({ name: 'is_suspicious', type: 'boolean', default: false })
  isSuspicious!: boolean;

  @BeforeInsert()
  setId(): void {
    this.id ??= randomUUID();
  }
}
