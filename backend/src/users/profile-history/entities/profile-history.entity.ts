import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export enum ProfileType {
  MENTOR = 'mentor',
  MENTEE = 'mentee',
}

export enum ChangeReason {
  USER_EDIT = 'user_edit',
  ADMIN_EDIT = 'admin_edit',
  SYSTEM = 'system',
}

/**
 * Append-only record of a single profile field change (#1452).
 * There is deliberately no update/remove API: rows are immutable and retained
 * for at least one year. No FK to `users` so history survives permanent deletion.
 */
@Entity('profile_history')
@Index('IDX_profile_history_user_id', ['userId'])
@Index('IDX_profile_history_user_created', ['userId', 'createdAt'])
export class ProfileHistory {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'profile_type', type: 'enum', enum: ProfileType })
  profileType!: ProfileType;

  @Column({ name: 'field_name', type: 'varchar', length: 100 })
  fieldName!: string;

  @Column({ name: 'old_value', type: 'jsonb', nullable: true })
  oldValue!: unknown;

  @Column({ name: 'new_value', type: 'jsonb', nullable: true })
  newValue!: unknown;

  /** User id that made the change, or 'system' for automated changes. */
  @Column({ name: 'changed_by', type: 'varchar', length: 64, default: 'system' })
  changedBy!: string;

  @Column({ name: 'change_reason', type: 'enum', enum: ChangeReason, default: ChangeReason.SYSTEM })
  changeReason!: ChangeReason;

  /** Millisecond precision. */
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 3 })
  createdAt!: Date;
}
