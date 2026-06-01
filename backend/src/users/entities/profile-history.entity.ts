import { BeforeInsert, Column, Entity, Index, PrimaryColumn } from 'typeorm';
import { randomUUID } from 'crypto';

export enum ChangeReason {
  USER_EDIT = 'user_edit',
  ADMIN_EDIT = 'admin_edit',
  SYSTEM = 'system',
}

@Entity({ name: 'profile_history' })
@Index(['userId'])
@Index(['changedAt'])
export class ProfileHistory {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ name: 'field_name', type: 'varchar', length: 128 })
  fieldName!: string;

  @Column({ name: 'old_value', type: 'jsonb', nullable: true })
  oldValue!: unknown;

  @Column({ name: 'new_value', type: 'jsonb', nullable: true })
  newValue!: unknown;

  @Column({ name: 'changed_by', type: 'varchar', length: 128 })
  changedBy!: string;

  @Column({ name: 'change_reason', type: 'varchar', length: 32 })
  changeReason!: ChangeReason;

  @Column({ name: 'changed_at', type: 'timestamptz', precision: 3, default: () => 'now()' })
  changedAt!: Date;

  @BeforeInsert()
  setId(): void {
    this.id ??= randomUUID();
  }
}
