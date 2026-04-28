import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';

export enum SkillLevel {
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
}

@Entity('mentee_profiles')
export class MenteeProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column('simple-array', { nullable: true })
  learningGoals: string[];

  @Column('simple-array', { nullable: true })
  areasOfInterest: string[];

  @Column({ type: 'enum', enum: SkillLevel, nullable: true })
  currentSkillLevel: SkillLevel;

  @Column('simple-array', { nullable: true })
  preferredMentoringStyle: string[];

  @Column({ type: 'int', nullable: true })
  timeCommitmentHoursPerWeek: number;

  @Column({ nullable: true })
  professionalBackground: string;

  @Column({ nullable: true })
  jobTitle: string;

  @Column({ nullable: true })
  industry: string;

  @Column('simple-array', { nullable: true })
  portfolioLinks: string[];

  @OneToOne(() => User, (user) => user.menteeProfile)
  @JoinColumn()
  user: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}