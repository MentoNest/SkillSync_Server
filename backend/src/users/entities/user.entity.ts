import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { IsEmail, IsEnum, IsOptional, IsString, Length, Matches } from 'class-validator';
import { MentorProfile } from './mentor-profile.entity';

export enum UserStatus {
  ACTIVE = 'active',
  PENDING = 'pending',
  SUSPENDED = 'suspended',
  DELETED = 'deleted',
}

/** A platform account, identified by its (normalised, lower-case) Stellar wallet address. */
@Entity('users')
@Index('IDX_users_wallet_address', ['walletAddress'], { unique: true })
@Index('IDX_users_status', ['status'])
@Index('IDX_users_created_at', ['createdAt'])
@Index('IDX_users_last_login_at', ['lastLoginAt'])
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  /** Stored normalised (see normalizeWalletAddress) so lookups are case-insensitive. */
  @Column({ type: 'varchar', length: 56 })
  @IsString()
  @Matches(/^g[a-z2-7]{55}$/, { message: 'walletAddress must be a normalised Stellar public key' })
  walletAddress!: string;

  /** Optional; unique only when present (partial unique index in the migration). */
  @Column({ type: 'varchar', length: 255, nullable: true })
  @IsOptional()
  @IsEmail()
  email!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  @IsOptional()
  @IsString()
  @Length(1, 100)
  displayName!: string | null;

  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.ACTIVE })
  @IsEnum(UserStatus)
  status!: UserStatus;

  /** Incremented to invalidate every access token issued before the change. */
  @Column({ type: 'int', default: 0 })
  tokenVersion!: number;

  @Column({ type: 'varchar', length: 2048, nullable: true })
  @IsOptional()
  @IsString()
  avatarUrl!: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  @IsOptional()
  @IsString()
  timezone!: string | null;

  @Column({ type: 'varchar', length: 16, nullable: true })
  @IsOptional()
  @IsString()
  locale!: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastLoginAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;

  /** Soft delete: rows are hidden from normal queries, not removed. */
  @DeleteDateColumn({ type: 'timestamptz', nullable: true })
  deletedAt!: Date | null;

  /** Present only for users who are mentors. */
  @OneToOne(() => MentorProfile, (profile) => profile.user)
  mentorProfile?: MentorProfile;
}
