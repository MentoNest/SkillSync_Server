import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
