import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity.js';

export enum VerificationMethod {
  EMAIL = 'email',
  ID = 'id',
  CREDENTIAL = 'credential',
}

export enum VerificationStatus {
  PENDING = 'pending',
  VERIFIED = 'verified',
  REVOKED = 'revoked',
}

/**
 * #997: Verification badge for a mentor profile.
 *
 * Stores the current verification state and the audit trail of admin actions.
 */
@Entity('verification_badges')
@Index(['mentorId'])
@Index(['status'])
export class VerificationBadge {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** The mentor being verified (FK → users). */
  @Column({ type: 'uuid', unique: true })
  mentorId: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'mentorId' })
  mentor: User;

  @Column({
    type: 'enum',
    enum: VerificationStatus,
    default: VerificationStatus.PENDING,
  })
  status: VerificationStatus;

  /**
   * At least one verification method must be recorded before granting the badge.
   */
  @Column({
    type: 'enum',
    enum: VerificationMethod,
    nullable: true,
  })
  verificationMethod: VerificationMethod | null;

  /** Admin who approved/revoked. FK → users. */
  @Column({ type: 'uuid', nullable: true })
  verifiedByAdminId: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'verifiedByAdminId' })
  verifiedByAdmin: User | null;

  /** Internal notes visible only to admins. */
  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  verifiedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
