import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../user/user.entity';

@Entity('mentor_profiles')
@Index('idx_mentor_wallet', ['walletAddress'], { unique: true })
export class MentorProfile {
  @ApiProperty({ description: 'Auto-generated UUID.', example: 'a1b2c3d4-...' })
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ApiProperty({
    description: 'Stellar wallet address of the owning user.',
    example: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37',
  })
  @Column({ name: 'wallet_address', type: 'varchar', length: 56 })
  walletAddress!: string;

  @OneToOne(() => User, (user) => user.mentorProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'wallet_address', referencedColumnName: 'walletAddress' })
  user?: User;

  @ApiProperty({
    description: 'Short professional bio.',
    example: 'Senior engineer with 10 years in distributed systems.',
    maxLength: 500,
  })
  @Column({ name: 'bio', type: 'varchar', length: 500 })
  bio!: string;

  @ApiProperty({
    description: 'List of skill tags the mentor teaches.',
    example: ['TypeScript', 'NestJS', 'PostgreSQL'],
    type: [String],
  })
  @Column({ name: 'skills', type: 'jsonb' })
  skills!: string[];

  @ApiPropertyOptional({
    description: 'Hourly rate in USD cents (e.g. 5000 = $50.00). Null means free / arrange offline.',
    example: 5000,
    type: Number,
    nullable: true,
  })
  @Column({ name: 'hourly_rate_usd_cents', type: 'int', nullable: true })
  hourlyRateUsdCents!: number | null;

  @ApiProperty({
    description: 'Maximum number of active mentees this mentor will accept.',
    example: 3,
  })
  @Column({ name: 'max_mentees', type: 'smallint', default: 3 })
  maxMentees!: number;

  @ApiProperty({
    description: 'Languages the mentor is comfortable working in.',
    example: ['English', 'Spanish'],
    type: [String],
  })
  @Column({ name: 'languages', type: 'jsonb', default: [] })
  languages!: string[];

  @ApiProperty({
    description: 'Profile is visible in search results.',
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
