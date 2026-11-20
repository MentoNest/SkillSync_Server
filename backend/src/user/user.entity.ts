import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Column, CreateDateColumn, Entity, Index, PrimaryColumn } from 'typeorm';

@Entity('users')
export class User {
  @ApiProperty({
    description: 'Stellar wallet public key (ED25519). Primary key.',
    example: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37',
  })
  @PrimaryColumn({ name: 'wallet_address', length: 56 })
  walletAddress!: string;

  @ApiPropertyOptional({
    description:
      'Unique username chosen by the user. 3–30 characters, alphanumeric plus underscores and dashes, ' +
      'no consecutive special characters, cannot start or end with a special character. ' +
      'Null until the user sets one.',
    example: 'alice_dev',
    nullable: true,
  })
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
  @Column({ name: 'display_name', type: 'varchar', length: 50, nullable: true })
  displayName!: string | null;

  @ApiPropertyOptional({
    description:
      'When the username was last changed. Used to enforce the 30-day cooldown between changes.',
    nullable: true,
  })
  @Column({ name: 'username_changed_at', type: 'timestamptz', nullable: true })
  usernameChangedAt!: Date | null;

  @ApiProperty({ description: 'UTC timestamp of account creation.' })
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  /** Derived display name: returns displayName if set, otherwise the first 8 chars of the wallet address. */
  get effectiveDisplayName(): string {
    return this.displayName ?? this.walletAddress.slice(0, 8);
  }
}
