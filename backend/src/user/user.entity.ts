import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsEmail,
  IsEnum,
  IsOptional,
  IsString,
  IsUrl,
  Length,
  MaxLength,
} from 'class-validator';
import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  JoinTable,
  ManyToMany,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { MenteeProfile } from '../profile/mentee-profile.entity';
import { MentorProfile } from '../profile/mentor-profile.entity';
import { RoleEntity } from './role.entity';
import { UserStatus } from './user-status.enum';
import { IsIanaTimezone } from '../common/validators/timezone.validator';

@Entity('users')
@Index('idx_users_status', ['status'])
@Index('idx_users_created_at', ['createdAt'])
@Index('idx_users_last_login_at', ['lastLoginAt'])
@Index('idx_users_wallet_status', ['walletAddress', 'status'])
@Index('idx_users_role_status_created', ['role', 'status', 'createdAt'])
@Index('idx_users_status_role_created', ['status', 'role', 'createdAt'])
export class User {
  @ApiProperty({
    description: 'Stellar wallet public key (ED25519). Unique account identifier.',
    example: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37',
  })
  @IsString()
  @Length(56, 56)
  @Index('idx_users_wallet_address')
  @PrimaryColumn({ name: 'wallet_address', length: 56 })
  walletAddress!: string;

  @ApiPropertyOptional({
    description: 'Optional unique email address.',
    example: 'alice@example.com',
    nullable: true,
  })
  @IsOptional()
  @IsEmail()
  @MaxLength(255)
  @Index('uq_users_email', { unique: true, where: '"email" IS NOT NULL' })
  @Column({ type: 'varchar', length: 255, nullable: true })
  email!: string | null;

  @ApiPropertyOptional({
    description:
      'Unique username chosen by the user. 3–30 characters, alphanumeric plus underscores and dashes, ' +
      'no consecutive special characters, cannot start or end with a special character. ' +
      'Null until the user sets one.',
    example: 'alice_dev',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(30)
  @Index({ unique: true, where: '"username" IS NOT NULL' })
  @Column({ type: 'varchar', length: 30, nullable: true, unique: false })
  username!: string | null;

  @ApiPropertyOptional({
    description:
      'Public display name. Up to 50 characters, no uniqueness requirement. ' +
      'Defaults to the first 8 characters of the wallet address when not set.',
    example: 'Alice the Developer',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(50)
  @Column({ name: 'display_name', type: 'varchar', length: 50, nullable: true })
  displayName!: string | null;

  @ApiProperty({
    description: 'Account status.',
    enum: UserStatus,
    example: UserStatus.ACTIVE,
  })
  @IsEnum(UserStatus)
  @Column({
    type: 'enum',
    enum: UserStatus,
    enumName: 'user_status_enum',
    default: UserStatus.ACTIVE,
  })
  status!: UserStatus;

  @ApiPropertyOptional({
    description:
      'Primary role used for list filtering. Denormalised from the user_roles relation so the ' +
      '(role, status, createdAt) composite index can serve admin list queries without a join.',
    example: 'mentor',
    nullable: true,
  })
  @IsOptional()
  @IsString()
  @MaxLength(32)
  @Column({ name: 'role', type: 'varchar', length: 32, nullable: true })
  role!: string | null;

  @ApiPropertyOptional({ description: 'Avatar URL.', nullable: true })
  @IsOptional()
  @IsUrl({ require_tld: false })
  @MaxLength(2048)
  @Column({ name: 'avatar_url', type: 'varchar', length: 2048, nullable: true })
  avatarUrl!: string | null;

  @ApiProperty({ description: 'User timezone (IANA).', example: 'UTC', default: 'UTC' })
  @IsIanaTimezone()
  @IsString()
  @MaxLength(64)
  @Column({ type: 'varchar', length: 64, default: 'UTC' })
  timezone!: string;

  @ApiPropertyOptional({ description: 'User locale.', example: 'en-US', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  @Column({ type: 'varchar', length: 16, nullable: true, default: 'en' })
  locale!: string | null;

  @ApiPropertyOptional({
    description: 'Optional education history. Contributes to the profile completeness bonus.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @Column({ type: 'jsonb', default: [] })
  education!: string[];

  @ApiPropertyOptional({
    description: 'Optional certifications. Contributes to the profile completeness bonus.',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @Column({ type: 'jsonb', default: [] })
  certifications!: string[];

  @ApiPropertyOptional({
    description: 'When the username was last changed. Used to enforce the 30-day cooldown between changes.',
    nullable: true,
  })
  @Column({ name: 'username_changed_at', type: 'timestamptz', nullable: true })
  usernameChangedAt!: Date | null;

  @ApiPropertyOptional({ description: 'Last login timestamp.', nullable: true })
  @Column({ name: 'last_login_at', type: 'timestamptz', nullable: true })
  lastLoginAt!: Date | null;

  @ApiProperty({ description: 'UTC timestamp of account creation.' })
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ApiProperty({ description: 'UTC timestamp of last update.' })
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ApiPropertyOptional({ description: 'Soft delete timestamp.', nullable: true })
  @DeleteDateColumn({ name: 'deleted_at', type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  @ManyToMany(() => RoleEntity, (role) => role.users, { eager: false })
  @JoinTable({
    name: 'user_roles',
    joinColumn: { name: 'wallet_address', referencedColumnName: 'walletAddress' },
    inverseJoinColumn: { name: 'role_name', referencedColumnName: 'name' },
  })
  roles?: RoleEntity[];

  @OneToOne(() => MentorProfile, (profile) => profile.user, { nullable: true })
  mentorProfile?: MentorProfile | null;

  @OneToOne(() => MenteeProfile, (profile) => profile.user, { nullable: true })
  menteeProfile?: MenteeProfile | null;

  /** Derived display name: returns displayName if set, otherwise the first 8 chars of the wallet address. */
  get effectiveDisplayName(): string {
    return this.displayName ?? this.walletAddress.slice(0, 8);
  }
}
