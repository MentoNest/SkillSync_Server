import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Check,
  Column,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';

/**
 * Who or what triggered the change.
 *
 * - `user_edit`  — the profile owner changed a field themselves
 * - `admin_edit` — an admin acted on behalf of the user
 * - `system`     — an automated process (seed, migration backfill, etc.)
 */
export enum ChangeReason {
  USER_EDIT = 'user_edit',
  ADMIN_EDIT = 'admin_edit',
  SYSTEM = 'system',
}

/**
 * Broad category for the entity that was changed.  Kept as a plain string column
 * rather than a foreign-key so this table stays append-only even after entities
 * are removed or renamed.
 */
export type ProfileType = 'user' | 'mentor' | 'mentee' | string;

/**
 * Immutable record of a single field change on a user profile.
 *
 * Design constraints:
 *  - No UPDATE or DELETE is ever issued against this table from application code.
 *  - `retain_until` is set to `changed_at + 1 year` on insert; a future retention
 *    job can use it to prune old rows without changing the schema.
 *  - Sensitive fields (see REDACTED_USER_FIELDS) have their values replaced with
 *    `[REDACTED]` before the row is written.
 */
@Entity('profile_history')
@Index('idx_ph_user_changed', ['userId', 'changedAt'])
@Index('idx_ph_retain_until', ['retainUntil'])
@Index('idx_ph_user_type_changed', ['userId', 'profileType', 'changedAt'])
@Index('idx_ph_reason_changed', ['changeReason', 'changedAt'])
export class ProfileHistory {
  @ApiProperty({ description: 'Auto-generated UUID primary key.', example: 'a1b2c3d4-...' })
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ApiProperty({
    description: 'Wallet address of the user whose profile changed.',
    example: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37',
  })
  @Column({ name: 'user_id', type: 'varchar', length: 56 })
  userId!: string;

  @ApiProperty({
    description: 'Broad category of the entity that changed.',
    example: 'user',
    enum: ['user', 'mentor', 'mentee'],
  })
  @Column({ name: 'profile_type', type: 'varchar', length: 32 })
  profileType!: ProfileType;

  @ApiProperty({
    description: 'Name of the entity property (TypeORM field name) that changed.',
    example: 'username',
  })
  @Column({ name: 'field_name', type: 'varchar', length: 64 })
  fieldName!: string;

  @ApiPropertyOptional({
    description: 'Value before the change. Null for a first-time write. Sensitive values are redacted.',
    nullable: true,
    example: null,
  })
  @Column({ name: 'old_value', type: 'jsonb', nullable: true })
  oldValue!: unknown;

  @ApiPropertyOptional({
    description: 'Value after the change. Null when the field was cleared. Sensitive values are redacted.',
    nullable: true,
    example: 'alice_dev',
  })
  @Column({ name: 'new_value', type: 'jsonb', nullable: true })
  newValue!: unknown;

  @ApiProperty({
    description:
      'Wallet address of the actor, or "system" for automated changes.',
    example: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37',
  })
  @Column({ name: 'changed_by', type: 'varchar', length: 56 })
  changedBy!: string;

  @ApiProperty({
    description: 'What triggered this change.',
    enum: ChangeReason,
    example: ChangeReason.USER_EDIT,
  })
  @Column({ name: 'change_reason', type: 'varchar', length: 16 })
  changeReason!: ChangeReason;

  @ApiProperty({
    description: 'UTC timestamp with millisecond precision.',
    example: '2024-06-01T12:00:00.123Z',
  })
  @Column({
    name: 'changed_at',
    type: 'timestamptz',
    precision: 3,
  })
  changedAt!: Date;

  @ApiProperty({
    description:
      'Earliest date at which this record may be pruned (changedAt + 1 year). ' +
      'Records must be retained until at least this date.',
    example: '2025-06-01T12:00:00.123Z',
  })
  @Column({ name: 'retain_until', type: 'timestamptz', precision: 3 })
  retainUntil!: Date;
}
