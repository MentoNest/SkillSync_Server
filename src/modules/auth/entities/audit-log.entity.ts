import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  ManyToOne,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';

export enum AuditEventType {
  LOGIN_SUCCESS = 'login_success',
  LOGIN_FAILED = 'login_failed',
  NONCE_GENERATED = 'nonce_generated',
  SIGNATURE_VERIFIED = 'signature_verified',
  TOKEN_REFRESHED = 'token_refreshed',
  TOKEN_REVOKED = 'token_revoked',
  LOGOUT = 'logout',
  PERMISSION_DENIED = 'permission_denied',
  ACCOUNT_LOCKED = 'account_locked',
  ACCOUNT_UNLOCKED = 'account_unlocked',
  SESSIONS_REVOKED = 'sessions_revoked',
  PROFILE_UPDATED = 'profile_updated',
}

/**
 * Audit Log Entity for tracking authentication events and suspicious activities
 * Used for security monitoring, compliance, and forensics
 */
@Entity('audit_logs')
@Index(['userId', 'createdAt'])
@Index(['walletAddress', 'createdAt'])
@Index(['ipAddress', 'createdAt'])
@Index(['isSuspicious', 'createdAt'])
@Index(['eventType', 'createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'userId' })
  user: User | null;

  @Column()
  walletAddress: string;

  @Column({ type: 'enum', enum: AuditEventType })
  eventType: AuditEventType;

  @Column()
  ipAddress: string;

  @Column({ nullable: true })
  userAgent: string;

  @Column({ nullable: true })
  country: string;

  @Column({ type: 'float', nullable: true })
  latitude: number;

  @Column({ type: 'float', nullable: true })
  longitude: number;

  @Column({ default: false })
  isSuspicious: boolean;

  @Column({ type: 'simple-array', nullable: true })
  suspiciousReasons: string[];

  @Column({ type: 'text', nullable: true })
  errorMessage: string;

  @Column({ nullable: true })
  deviceFingerprint: string;

  @Column({ nullable: true })
  sessionId: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @CreateDateColumn()
  createdAt: Date;
}
