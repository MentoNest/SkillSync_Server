import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum AuditEvent {
  NONCE_REQUESTED = 'nonce_requested',
  LOGIN_SUCCESS = 'login_success',
  LOGIN_FAILURE = 'login_failure',
  TOKEN_REFRESHED = 'token_refreshed',
  LOGOUT = 'logout',
  ROLE_CHANGED = 'role_changed',
  AVATAR_UPDATED = 'avatar_updated',
  PORTFOLIO_LINK_ADDED = 'portfolio_link_added',
  PORTFOLIO_LINK_REMOVED = 'portfolio_link_removed',
}

@Entity('audit_logs')
@Index(['userId', 'createdAt'])
@Index(['event', 'createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'enum', enum: AuditEvent })
  event!: AuditEvent;

  @Column({ type: 'uuid', nullable: true })
  userId!: string | null;

  @Column({ type: 'varchar', length: 56, nullable: true })
  walletAddress!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  ipAddress!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  userAgent!: string | null;

  /** Never put tokens, signatures or nonces in here. */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  metadata!: Record<string, unknown>;

  @Index()
  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
