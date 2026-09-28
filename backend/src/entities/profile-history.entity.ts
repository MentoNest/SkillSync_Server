import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, Index } from 'typeorm';

export enum ProfileChangeReason {
  USER_EDIT = 'user_edit',
  ADMIN_EDIT = 'admin_edit',
  SYSTEM = 'system',
}

/**
 * Fix #1172: append-only audit trail for mentor/mentee profile field
 * changes. Rows are never updated or deleted.
 */
@Entity('profile_history')
@Index('IDX_profile_history_userId', ['userId'])
export class ProfileHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar' })
  profileType: 'mentor' | 'mentee';

  @Column({ type: 'varchar' })
  fieldName: string;

  @Column({ type: 'jsonb', nullable: true })
  oldValue: unknown;

  @Column({ type: 'jsonb', nullable: true })
  newValue: unknown;

  @Column({ type: 'varchar', nullable: true })
  changedBy: string | null;

  @Column({ type: 'varchar', default: ProfileChangeReason.USER_EDIT })
  reason: ProfileChangeReason;

  @CreateDateColumn({ type: 'timestamp with time zone', precision: 3 })
  timestamp: Date;
}
