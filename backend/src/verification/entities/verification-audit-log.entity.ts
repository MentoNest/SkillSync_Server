import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity.js';

export enum VerificationAuditAction {
  REQUEST_SUBMITTED = 'request_submitted',
  VERIFIED = 'verified',
  REVOKED = 'revoked',
  NOTES_UPDATED = 'notes_updated',
}

/**
 * #997: Immutable audit log for every verification badge state-change.
 */
@Entity('verification_audit_logs')
@Index(['mentorId'])
@Index(['adminId'])
export class VerificationAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  mentorId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'mentorId' })
  mentor: User;

  /** Null for user-initiated actions (e.g. request_submitted). */
  @Column({ type: 'uuid', nullable: true })
  adminId: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'adminId' })
  admin: User | null;

  @Column({
    type: 'enum',
    enum: VerificationAuditAction,
  })
  action: VerificationAuditAction;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  metadata: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;
}
