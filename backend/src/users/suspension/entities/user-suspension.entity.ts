import { Column, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** One row per suspension action; the active row (if any) is the current suspension. */
@Entity('user_suspensions')
@Index('IDX_user_suspensions_user_id', ['userId'])
@Index('IDX_user_suspensions_active', ['active'])
// Login check: "is this user currently suspended?" (#1463).
@Index('IDX_user_suspensions_user_active', ['userId', 'active'])
export class UserSuspension {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ type: 'varchar', length: 500 })
  reason!: string;

  @Column({ name: 'suspended_by', type: 'uuid' })
  suspendedBy!: string;

  @Column({ name: 'suspended_at', type: 'timestamptz' })
  suspendedAt!: Date;

  /** Null means a permanent suspension. */
  @Column({ name: 'suspended_until', type: 'timestamptz', nullable: true })
  suspendedUntil!: Date | null;

  @Column({ type: 'boolean', default: true })
  active!: boolean;
}
