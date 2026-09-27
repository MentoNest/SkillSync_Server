import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  CreateDateColumn,
  UpdateDateColumn,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../user/entities/user.entity';

@Entity('refresh_tokens')
export class RefreshToken {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'varchar', length: 1024 })
  token: string;

  /**
   * #1316: `jti` of the refresh JWT. Kept as a column so an audit entry or a
   * support query can be correlated with a token without storing it again.
   */
  @Index({ unique: true })
  @Column({ type: 'uuid', nullable: true })
  jti: string | null;

  /**
   * #1316: all refresh tokens descending from one login share a family id.
   * Reuse of an already rotated token revokes the whole family.
   */
  @Index()
  @Column({ type: 'uuid', nullable: true })
  familyId: string | null;

  /** #1316: the token that replaced this one, i.e. the next link in the chain. */
  @Column({ type: 'uuid', nullable: true })
  replacedById: string | null;

  /** #1316: when the token was exchanged, i.e. the end of its useful life. */
  @Column({ type: 'timestamp', nullable: true })
  usedAt: Date | null;

  /** #1316: why the token stopped being valid (rotated, logout, reuse, ...). */
  @Column({ type: 'varchar', length: 32, nullable: true })
  revocationReason: string | null;

  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  /**
   * #1316: hash of the user agent plus the client IP prefix. Compared on every
   * refresh so a session used from an unexpected device is visible, without
   * storing anything reversible.
   */
  @Column({ type: 'varchar', length: 64, nullable: true })
  deviceInfo: string | null;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ipAddress: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  userAgent: string | null;

  @Column({ type: 'boolean', default: false })
  isRevoked: boolean;

  @Column({ type: 'timestamp' })
  expiresAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
