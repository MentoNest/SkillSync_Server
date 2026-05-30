import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  JoinTable,
  ManyToMany,
  OneToMany,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { randomUUID } from 'crypto';
import { Role } from './role.entity';
import { UserSuspension } from './user-suspension.entity';

@Entity({ name: 'users' })
export class User {
  @PrimaryColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ name: 'wallet_address', type: 'varchar', length: 128 })
  walletAddress!: string;

  @Column({ name: 'token_version', type: 'int', default: 0 })
  tokenVersion!: number;

  @Column({ name: 'timezone', type: 'varchar', length: 64, default: 'UTC' })
  timezone!: string;

  @Column({ name: 'avatar_url', type: 'varchar', length: 512, nullable: true })
  avatarUrl!: string | null;

  @Column({ name: 'avatar_thumbnail_url', type: 'varchar', length: 512, nullable: true })
  avatarThumbnailUrl!: string | null;
  @Column({ name: 'is_verified', type: 'boolean', default: false })
  isVerified!: boolean;

  @Column({ name: 'verified_at', type: 'timestamptz', nullable: true })
  verifiedAt!: Date | null;

  @Column({ name: 'verified_by', type: 'varchar', length: 128, nullable: true })
  verifiedBy!: string | null;

  @Column({ name: 'verification_notes', type: 'text', nullable: true })
  verificationNotes!: string | null;

  @Index({ unique: true })
  @Column({ name: 'username', type: 'varchar', length: 30, nullable: true })
  username!: string | null;

  @Column({ name: 'display_name', type: 'varchar', length: 50, nullable: true })
  displayName!: string | null;

  @Column({ name: 'username_changed_at', type: 'timestamptz', nullable: true })
  usernameChangedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToMany(() => Role, (role) => role.users, { eager: true })
  @JoinTable({
    name: 'user_roles',
    joinColumn: { name: 'user_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'role_id', referencedColumnName: 'id' },
  })
  roles!: Role[];

  @OneToMany(() => UserSuspension, (suspension) => suspension.user)
  suspensions?: UserSuspension[];

  @BeforeInsert()
  setId(): void {
    this.id ??= randomUUID();
  }
}
