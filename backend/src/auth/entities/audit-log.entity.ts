import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

/**
 * #979: Audit log entity for authentication event tracking.
 *
 * Stores all auth-related events with structured JSONB details,
 * IP address, user agent, and suspicious activity flagging.
 */
@Entity('audit_logs')
@Index(['userId', 'eventType', 'timestamp'])
@Index(['timestamp'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'user_id', type: 'varchar', length: 56, nullable: true })
  @Index()
  userId: string | null;

  @Column({ name: 'event_type', type: 'varchar', length: 50 })
  @Index()
  eventType: AuthEventType;

  @Column({ name: 'ip_address', type: 'varchar', length: 45, nullable: true })
  ipAddress: string | null;

  @Column({ name: 'user_agent', type: 'varchar', length: 512, nullable: true })
  userAgent: string | null;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  details: Record<string, unknown>;

  @Column({ name: 'is_suspicious', type: 'boolean', default: false })
  @Index()
  isSuspicious: boolean;

  @CreateDateColumn()
  timestamp: Date;
}

export enum AuthEventType {
  LOGIN_SUCCESS = 'login_success',
  LOGIN_FAILURE = 'login_failure',
  LOGOUT = 'logout',
  TOKEN_REFRESH = 'token_refresh',
  TOKEN_REFRESH_FAILURE = 'token_refresh_failure',
  NONCE_GENERATED = 'nonce_generated',
  ROLE_ASSIGNED = 'role_assigned',
  ROLE_REVOKED = 'role_revoked',
  ADMIN_ACTION = 'admin_action',
  RATE_LIMITED = 'rate_limited',
  SUSPICIOUS_ACTIVITY = 'suspicious_activity',
}
