import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('mentee_profiles')
@Index('idx_mentee_wallet', ['walletAddress'], { unique: true })
export class MenteeProfile {
  @ApiProperty({ description: 'Auto-generated UUID.', example: 'b2c3d4e5-...' })
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ApiProperty({
    description: 'Stellar wallet address of the owning user.',
    example: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37',
  })
  @Column({ name: 'wallet_address', type: 'varchar', length: 56 })
  walletAddress!: string;

  @ApiProperty({
    description: 'What the mentee wants to learn or achieve.',
    example: 'I want to transition from backend to full-stack development.',
    maxLength: 500,
  })
  @Column({ name: 'learning_goals', type: 'varchar', length: 500 })
  learningGoals!: string;

  @ApiProperty({
    description: 'Topics or skills the mentee wants to focus on.',
    example: ['React', 'System Design'],
    type: [String],
  })
  @Column({ name: 'interests', type: 'jsonb' })
  interests!: string[];

  @ApiPropertyOptional({
    description:
      'Maximum monthly budget in USD cents the mentee can spend (e.g. 10000 = $100.00). ' +
      'Null means no budget preference.',
    example: 10000,
    nullable: true,
  })
  @Column({ name: 'budget_usd_cents_per_month', type: 'int', nullable: true })
  budgetUsdCentsPerMonth!: number | null;

  @ApiProperty({
    description: 'Self-assessed experience level.',
    example: 'intermediate',
    enum: ['beginner', 'intermediate', 'advanced'],
  })
  @Column({ name: 'experience_level', type: 'varchar', length: 16 })
  experienceLevel!: string;

  @ApiProperty({
    description: 'Languages the mentee is comfortable working in.',
    example: ['English'],
    type: [String],
  })
  @Column({ name: 'languages', type: 'jsonb', default: [] })
  languages!: string[];

  @ApiProperty({
    description: 'Profile is visible to mentors.',
    example: true,
  })
  @Column({ name: 'is_active', type: 'boolean', default: true })
  isActive!: boolean;

  @ApiProperty({ description: 'UTC creation timestamp.' })
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 3 })
  createdAt!: Date;

  @ApiProperty({ description: 'UTC last-updated timestamp.' })
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz', precision: 3 })
  updatedAt!: Date;
}
