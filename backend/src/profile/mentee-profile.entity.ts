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
  VersionColumn,
} from 'typeorm';
import { User } from '../user/user.entity';

export enum SkillLevel {
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
}

@Entity('mentee_profiles')
@Index('idx_mentee_wallet', ['walletAddress'], { unique: true })
@Index('idx_mentee_wallet_active', ['walletAddress', 'isActive'])
@Index('idx_mentee_active_experience', ['isActive', 'experienceLevel'])
@Index('idx_mentee_created_at', ['createdAt'])
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

  @OneToOne(() => User, (user) => user.menteeProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'wallet_address', referencedColumnName: 'walletAddress' })
  user?: User;

  @ApiProperty({
    description:
      'Learning goals the mentee wants to achieve (max 500 chars each).',
    example: [
      'Transition from backend to full-stack development',
      'Master system design',
    ],
    type: [String],
  })
  @Column({
    name: 'learning_goals',
    type: 'text',
    array: true,
    default: () => "'{}'::text[]",
  })
  learningGoals!: string[];

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
    type: Number,
    nullable: true,
  })
  @Column({ name: 'budget_usd_cents_per_month', type: 'int', nullable: true })
  budgetUsdCentsPerMonth!: number | null;

  @ApiProperty({
    description: 'Self-assessed current skill level.',
    example: SkillLevel.INTERMEDIATE,
    enum: SkillLevel,
  })
  @Column({
    name: 'experience_level',
    type: 'enum',
    enum: SkillLevel,
    enumName: 'skill_level_enum',
  })
  experienceLevel!: SkillLevel;

  @ApiProperty({
    description:
      'Preferred mentoring styles (e.g. career advice, technical skills, interview prep).',
    example: ['technical skills', 'career advice'],
    type: [String],
  })
  @Column({
    name: 'preferred_mentoring_style',
    type: 'text',
    array: true,
    default: () => "'{}'::text[]",
  })
  preferredMentoringStyle!: string[];

  @ApiPropertyOptional({
    description: 'Weekly time commitment in hours.',
    example: 5,
    type: Number,
    nullable: true,
  })
  @Column({
    name: 'time_commitment_hours_per_week',
    type: 'int',
    nullable: true,
  })
  timeCommitmentHoursPerWeek!: number | null;

  @ApiPropertyOptional({
    description: 'Summary of the mentee professional background.',
    example: '3 years working on backend Node.js microservices.',
    type: String,
    nullable: true,
  })
  @Column({ name: 'professional_background', type: 'text', nullable: true })
  professionalBackground!: string | null;

  @ApiPropertyOptional({
    description: 'Current job title (optional).',
    example: 'Junior Backend Engineer',
    type: String,
    nullable: true,
  })
  @Column({ name: 'job_title', type: 'varchar', length: 120, nullable: true })
  jobTitle!: string | null;

  @ApiPropertyOptional({
    description: 'Industry sector (optional).',
    example: 'FinTech',
    type: String,
    nullable: true,
  })
  @Column({ name: 'industry', type: 'varchar', length: 120, nullable: true })
  industry!: string | null;

  @ApiPropertyOptional({
    description: 'Optional portfolio or personal project URLs.',
    example: ['https://github.com/alice'],
    type: [String],
  })
  @Column({
    name: 'portfolio_links',
    type: 'jsonb',
    default: () => "'[]'::jsonb",
  })
  portfolioLinks!: string[];

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

  @ApiProperty({
    description: 'Incremented whenever this profile is updated.',
    example: 1,
  })
  @VersionColumn({ name: 'version' })
  version!: number;
}
