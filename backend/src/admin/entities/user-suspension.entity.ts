import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../user/user.entity';

@Entity('user_suspensions')
@Index('idx_user_suspensions_wallet_active', ['walletAddress', 'isActive'])
@Index('idx_user_suspensions_active_until', ['isActive', 'suspendedUntil'])
@Index('idx_user_suspensions_suspended_at', ['suspendedAt'])
export class UserSuspension {
  @ApiProperty({ description: 'Suspension record UUID.' })
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ApiProperty({ description: 'Suspended user wallet address.' })
  @Column({ name: 'wallet_address', type: 'varchar', length: 56 })
  walletAddress!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'wallet_address', referencedColumnName: 'walletAddress' })
  user?: User;

  @ApiProperty({ description: 'Reason for suspension.' })
  @Column({ type: 'text' })
  reason!: string;

  @ApiProperty({
    description: 'Admin wallet address who issued the suspension.',
  })
  @Column({ name: 'suspended_by', type: 'varchar', length: 56 })
  suspendedBy!: string;

  @ApiProperty({ description: 'Timestamp when the suspension was created.' })
  @Column({ name: 'suspended_at', type: 'timestamptz' })
  suspendedAt!: Date;

  @ApiPropertyOptional({
    description:
      'Timestamp when the suspension expires, or null for permanent.',
    type: String,
    format: 'date-time',
    nullable: true,
  })
  @Column({ name: 'suspended_until', type: 'timestamptz', nullable: true })
  suspendedUntil!: Date | null;

  @ApiProperty({ description: 'Whether this suspension is currently active.' })
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @ApiPropertyOptional({
    description: 'Timestamp when the suspension was lifted or expired.',
    type: String,
    format: 'date-time',
    nullable: true,
  })
  @Column({ name: 'lifted_at', type: 'timestamptz', nullable: true })
  liftedAt!: Date | null;

  @ApiPropertyOptional({
    description:
      'Actor who lifted the suspension (admin wallet or system:expired).',
    type: String,
    nullable: true,
  })
  @Column({ name: 'lifted_by', type: 'varchar', length: 64, nullable: true })
  liftedBy!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
