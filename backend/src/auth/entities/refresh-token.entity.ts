import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

/** Hash-only refresh token record (shape shared with the refresh-token PR). */
@Entity('refresh_tokens')
// Logout / revoke-all scan by user, restricted to still-live rows (#1463).
@Index('IDX_refresh_tokens_user_revoked', ['userId', 'revokedAt'])
// Rotation walks one token family (#1463).
@Index('IDX_refresh_tokens_family_revoked', ['familyId', 'revokedAt'])
// Expired-token cleanup (#1463).
@Index('IDX_refresh_tokens_expires_at', ['expiresAt'])
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index()
  @Column({ type: 'uuid' })
  userId!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 64 })
  tokenHash!: string;

  @Index()
  @Column({ type: 'uuid' })
  familyId!: string;

  @Column({ type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt!: Date | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;
}
