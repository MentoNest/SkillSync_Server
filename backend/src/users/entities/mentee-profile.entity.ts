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
import { User } from './user.entity';

export enum SkillLevel {
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
}

export const MAX_LEARNING_GOALS = 10;
export const MAX_LEARNING_GOAL_LENGTH = 500;
export const MAX_PREFERRED_STYLES = 10;

/** Mentee-specific details, one per user. Deleted together with the user. */
@Entity('mentee_profiles')
@Index('IDX_mentee_profiles_user_id', ['userId'], { unique: true })
@Index('IDX_mentee_profiles_skill_level', ['skillLevel'])
export class MenteeProfile {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @OneToOne(() => User, (user) => user.menteeProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ name: 'learning_goals', type: 'text', array: true, default: () => "'{}'" })
  learningGoals!: string[];

  @Column({ name: 'areas_of_interest', type: 'text', array: true, default: () => "'{}'" })
  areasOfInterest!: string[];

  @Column({ name: 'skill_level', type: 'enum', enum: SkillLevel, default: SkillLevel.BEGINNER })
  skillLevel!: SkillLevel;

  @Column({ name: 'preferred_mentoring_style', type: 'text', array: true, default: () => "'{}'" })
  preferredMentoringStyle!: string[];

  @Column({ name: 'time_commitment_hours', type: 'int', default: 0 })
  timeCommitmentHours!: number;

  @Column({ name: 'professional_background', type: 'text', nullable: true })
  professionalBackground!: string | null;

  @Column({ name: 'job_title', type: 'varchar', length: 120, nullable: true })
  jobTitle!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  industry!: string | null;

  @Column({ name: 'portfolio_links', type: 'jsonb', default: () => "'[]'" })
  portfolioLinks!: string[];

  @Column({ name: 'profile_version', type: 'int', default: 1 })
  profileVersion!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
