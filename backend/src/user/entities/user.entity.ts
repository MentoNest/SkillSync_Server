import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToMany,
  JoinTable,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { Role } from '../../entities/role.entity';

export enum ProfileType {
  MENTOR = 'mentor',
  MENTEE = 'mentee',
  BOTH = 'both',
  ADMIN = 'admin',
}

/**
 * #1176: Lifecycle status of a user account.
 * - active: normal, fully-functional account (default).
 * - pending_verification: reserved for a future email/identity verification flow.
 * - suspended: temporarily or permanently blocked by an admin (#1175).
 * - deleted: soft-deleted by the user or an admin (#1174).
 */
export enum UserStatus {
  ACTIVE = 'active',
  PENDING_VERIFICATION = 'pending_verification',
  SUSPENDED = 'suspended',
  DELETED = 'deleted',
}

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true, where: '"walletAddress" IS NOT NULL' })
  @Column({ type: 'varchar', length: 56, nullable: true, unique: true })
  walletAddress: string | null;

  @Index({ unique: true, where: '"email" IS NOT NULL' })
  @Column({ type: 'varchar', length: 255, nullable: true, unique: true })
  email: string | null;

  @Index('IDX_users_displayName')
  @Column({ type: 'varchar', length: 100, nullable: true })
  displayName: string | null;

  // #1177: unique handle, nullable initially so existing users are
  // unaffected until they pick one via PATCH /user/username.
  @Index('IDX_users_username', { unique: true, where: '"username" IS NOT NULL' })
  @Column({ type: 'varchar', length: 30, nullable: true, unique: true })
  username: string | null;

  // #1177: last time `username` changed, used to enforce the 30-day
  // cooldown between changes.
  @Column({ type: 'timestamp', nullable: true })
  usernameChangedAt: Date | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  passwordHash: string | null;

  @Column({ type: 'text', nullable: true })
  bio: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  avatarUrl: string | null;

  @Column({
    type: 'enum',
    enum: ProfileType,
    default: ProfileType.MENTEE,
  })
  profileType: ProfileType;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  settings: Record<string, any>;

  @Column({ type: 'int', default: 0 })
  tokenVersion: number;

  // #1176: account lifecycle status. Guards reject any request from a
  // non-active user (see RolesGuard), and public endpoints filter on it.
  @Index('IDX_users_status')
  @Column({
    type: 'enum',
    enum: UserStatus,
    default: UserStatus.ACTIVE,
  })
  status: UserStatus;

  // #1174: soft-delete timestamp. Non-null while status === DELETED; used
  // to compute the restore grace period and eligibility for permanent
  // (hard) deletion.
  @Index('IDX_users_deletedAt')
  @Column({ type: 'timestamp', nullable: true })
  deletedAt: Date | null;

  @Column({ type: 'boolean', default: false })
  isLocked: boolean;

  @Column({ type: 'timestamp', nullable: true })
  lockoutUntil: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  lastLoginAt: Date | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  lastLoginIp: string | null;

  @ManyToMany(() => Role, (role) => role.users, { cascade: true, eager: true })
  @JoinTable({
    name: 'user_roles',
    joinColumn: { name: 'userId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'roleId', referencedColumnName: 'id' },
  })
  roles: Role[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
