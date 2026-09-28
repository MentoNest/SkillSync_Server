import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

/**
 * #1175: Suspension record for a user account. Multiple rows can exist per
 * user over time (suspension history); `isActive` marks the currently
 * effective one, if any. A null `suspendedUntil` means a permanent
 * suspension.
 */
@Entity('user_suspensions')
export class UserSuspension {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_user_suspensions_userId')
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'text' })
  reason: string;

  @Index('IDX_user_suspensions_suspendedBy')
  @Column({ type: 'uuid' })
  suspendedBy: string;

  @CreateDateColumn()
  suspendedAt: Date;

  // null = permanent suspension
  @Column({ type: 'timestamp', nullable: true })
  suspendedUntil: Date | null;

  // Whether this is the currently-effective suspension for the user.
  // Only one active row per user is expected at a time.
  @Index('IDX_user_suspensions_isActive')
  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @Column({ type: 'timestamp', nullable: true })
  liftedAt: Date | null;

  // uuid of the admin who lifted it, or null when it auto-expired
  @Column({ type: 'uuid', nullable: true })
  liftedBy: string | null;

  // 'unsuspended' (admin action) | 'expired' (auto-expiry at login/guard check)
  @Column({ type: 'varchar', length: 20, nullable: true })
  liftReason: string | null;
}
