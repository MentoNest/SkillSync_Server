import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export enum AuditEventType {
  LOGIN_SUCCESS = 'login_success',
  LOGIN_FAILED = 'login_failed',
  LOGOUT = 'logout',
  REFRESH_TOKEN = 'refresh_token',
  REFRESH_TOKEN_REUSE = 'refresh_token_reuse',
  PASSWORD_CHANGE = 'password_change',
  PASSWORD_RESET_REQUEST = 'password_reset_request',
  PASSWORD_RESET_COMPLETE = 'password_reset_complete',
  ACCOUNT_LOCKED = 'account_locked',
  ACCOUNT_UNLOCKED = 'account_unlocked',
  REGISTRATION = 'registration',
}

@Entity('audit_logs')
@Index(['userId', 'createdAt'])
@Index(['eventType', 'createdAt'])
@Index(['ipAddress', 'createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'enum', enum: AuditEventType })
  eventType: AuditEventType;

  @Column({ type: 'varchar', length: 255, nullable: true })
  userId: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ipAddress: string | null;

  @Column({ type: 'text', nullable: true })
  userAgent: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  sessionId: string | null;

  @Column({ type: 'text', nullable: true })
  metadata: string | null;

  @Column({ type: 'boolean', default: false })
  success: boolean;

  @Column({ type: 'varchar', length: 500, nullable: true })
  failureReason: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
