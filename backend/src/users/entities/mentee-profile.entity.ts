import {
  Column, CreateDateColumn, Entity,
  JoinColumn, OneToOne, PrimaryGeneratedColumn, UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

export enum SkillLevel {
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
}

@Entity('mentee_profiles')
export class MenteeProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user: User;

  @Column({ name: 'user_id', type: 'uuid' })
  userId: string;

  @Column('simple-array', { nullable: true, name: 'learning_goals' })
  learningGoals: string[];

  @Column('simple-array', { nullable: true, name: 'areas_of_interest' })
  areasOfInterest: string[];

  @Column({ name: 'skill_level', type: 'enum', enum: SkillLevel, default: SkillLevel.BEGINNER })
  skillLevel: SkillLevel;

  @Column('simple-array', { nullable: true, name: 'preferred_mentoring_style' })
  preferredMentoringStyle: string[];

  @Column({ name: 'time_commitment_hours', type: 'int', nullable: true })
  timeCommitmentHoursPerWeek: number;

  @Column({ name: 'professional_background', type: 'text', nullable: true })
  professionalBackground: string;

  @Column({ name: 'job_title', nullable: true })
  jobTitle: string;

  @Column({ nullable: true })
  industry: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
