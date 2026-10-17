import { Column, CreateDateColumn, Entity, Index, JoinTable, ManyToMany, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';
import { Role } from '../../rbac/entities/role.entity';
import { UserStatus } from '../user-status/user-status.enum';

/** Minimal account record needed for RBAC; profile fields live in the users PR. */
@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 56 })
  walletAddress!: string;

  @Column({ type: 'enum', enum: UserStatus, enumName: 'users_status_enum', default: UserStatus.ACTIVE })
  status!: UserStatus;

  @Column({ type: 'varchar', length: 30, nullable: true })
  @Index('UQ_users_username', { unique: true, where: '"username" IS NOT NULL' })
  username!: string | null;

  @Column({ name: 'displayName', type: 'varchar', length: 50, nullable: true })
  displayName!: string | null;

  @Column({ name: 'avatarUrl', type: 'varchar', length: 2048, nullable: true })
  avatarUrl!: string | null;

  @Column({ name: 'usernameChangedAt', type: 'timestamptz', nullable: true })
  usernameChangedAt!: Date | null;

  @Column({ name: 'lastLoginAt', type: 'timestamptz', nullable: true })
  lastLoginAt!: Date | null;

  @Column({ type: 'int', default: 0 })
  tokenVersion!: number;

  @ManyToMany(() => Role, (r) => r.users)
  @JoinTable({
    name: 'user_roles',
    joinColumn: { name: 'user_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'role_id', referencedColumnName: 'id' },
  })
  roles!: Role[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
