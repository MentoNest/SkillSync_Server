import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserStatus } from '../users/enums/user-status.enum';

@Entity({ name: 'users' })
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /**
   * Encrypted Stellar wallet address (AES-256-GCM).
   * Use walletHash for exact-match database queries.
   * The plaintext value is restored automatically by UserEncryptionSubscriber.
   */
  @Column({ length: 256 })
  wallet: string;

  /**
   * HMAC-SHA-256 hash of the wallet address.
   * Indexed for O(1) exact-match lookups without exposing plaintext.
   */
  @Index({ unique: true })
  @Column({ length: 64, name: 'wallet_hash' })
  walletHash: string;

  @Column('simple-array')
  roles: string[];

  @Column('simple-array')
  permissions: string[];

  @Column({
    type: 'enum',
    enum: UserStatus,
    default: UserStatus.ACTIVE,
  })
  status: UserStatus;

  @Index({ unique: true, sparse: true })
  @Column({ length: 30, nullable: true, default: null })
  username: string | null;

  @Column({ length: 50, nullable: true, default: null })
  displayName: string | null;

  @Column({ nullable: true, default: null })
  usernameChangedAt: Date | null;

  @Column({ nullable: true, default: null })
  deletedAt: Date | null;

  @Index()
  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
