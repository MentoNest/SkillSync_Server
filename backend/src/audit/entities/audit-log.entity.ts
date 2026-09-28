import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * #1320: canonical audit event catalogue.
 *
 * Every authentication/security relevant action emits one of these event
 * types, which makes the audit trail queryable and alertable. Unknown event
 * types are still accepted (the column is a plain varchar, not a pg enum) so
 * new events can be rolled out without a migration.
 */
export enum AuditEventType {
  LOGIN_SUCCESS = 'LOGIN_SUCCESS',
  LOGIN_FAILURE = 'LOGIN_FAILURE',
  LOGOUT = 'LOGOUT',
  LOGOUT_ALL = 'LOGOUT_ALL',
  TOKEN_REFRESH = 'TOKEN_REFRESH',
  TOKEN_REFRESH_FAILURE = 'TOKEN_REFRESH_FAILURE',
  NONCE_ISSUED = 'NONCE_ISSUED',
  PASSWORD_CHANGE = 'PASSWORD_CHANGE',
  PASSWORD_RESET = 'PASSWORD_RESET',
  ROLE_ASSIGNED = 'ROLE_ASSIGNED',
  ROLE_REVOKED = 'ROLE_REVOKED',
  SESSIONS_REVOKED = 'SESSIONS_REVOKED',
  SUSPICIOUS_ACTIVITY = 'SUSPICIOUS_ACTIVITY',
}

/**
 * #1320: single source of truth for the `audit_logs` table.
 *
 * Replaces the two divergent definitions that used to map the same table
 * (`src/entities/audit-log.entity.ts` and `src/auth/entities/audit-log.entity.ts`);
 * both now re-export this class so a single entity is registered per DataSource.
 *
 * Indexes cover the three access patterns the compliance endpoints rely on:
 * "everything for user X" (`userId`), "everything of type Y" (`eventType`) and
 * "everything in a date range / retention sweep" (`timestamp`).
 */
@Entity({ name: 'audit_logs' })
@Index('IDX_audit_logs_userId', ['userId'])
@Index('IDX_audit_logs_eventType', ['eventType'])
@Index('IDX_audit_logs_timestamp', ['timestamp'])
@Index('IDX_audit_logs_isSuspicious', ['isSuspicious'])
@Index('IDX_audit_logs_walletAddress', ['walletAddress'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ type: 'varchar', length: 100 })
  eventType: AuditEventType | string;

  /** Wallet the event relates to — populated even when the user is unknown. */
  @Column({ type: 'varchar', length: 56, nullable: true })
  walletAddress: string | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ipAddress: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  userAgent: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  timestamp: Date;

  /** Free-form, event specific context (JSONB). */
  @Column({ type: 'jsonb', default: () => "'{}'" })
  details: Record<string, any>;

  @Column({ type: 'boolean', default: false })
  isSuspicious: boolean;

  @Column({ type: 'text', nullable: true })
  suspiciousReason: string | null;

  // ─── Coarse geo enrichment kept for the security dashboard (#1157) ────────
  @Column({ type: 'varchar', length: 100, nullable: true })
  geoCountry: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  geoCity: string | null;

  @Column({ type: 'double precision', nullable: true })
  geoLat: number | null;

  @Column({ type: 'double precision', nullable: true })
  geoLon: number | null;

  /**
   * Backwards compatible alias for {@link details} — older call sites persist
   * event context under `metadata`. Declared as an accessor pair (not a column)
   * so both names address the same JSONB value and only one column exists.
   */
  get metadata(): Record<string, any> {
    return this.details;
  }

  set metadata(value: Record<string, any>) {
    this.details = value;
  }

  /** Backwards compatible alias for {@link timestamp}. */
  get createdAt(): Date {
    return this.timestamp;
  }

  set createdAt(value: Date) {
    this.timestamp = value;
  }
}
