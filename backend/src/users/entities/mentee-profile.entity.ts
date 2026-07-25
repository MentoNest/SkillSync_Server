import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity.js';

export enum SkillLevel {
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
}

@Entity('mentee_profiles')
export class MenteeProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User, (user) => user.menteeProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string;

  @Column('text', { array: true, default: '{}' })
  learningGoals: string[];

  @Column('simple-array', { default: '' })
  areasOfInterest: string[];

  @Column({ type: 'enum', enum: SkillLevel, default: SkillLevel.BEGINNER })
  currentSkillLevel: SkillLevel;

  @Column('simple-array', { default: '' })
  preferredMentoringStyle: string[];

  @Column({ type: 'int', default: 0 })
  timeCommitmentHoursPerWeek: number;

  @Column({ type: 'text', nullable: true })
  professionalBackground: string;

  @Column({ type: 'varchar', nullable: true })
  jobTitle: string;

  @Column({ type: 'varchar', nullable: true })
  industry: string;

  @Column('simple-array', { default: '' })
  portfolioLinks: string[];

  @Column({ type: 'int', default: 1 })
  profileVersion: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  get profileCompletion(): number {
    const requiredFields = [
      this.learningGoals?.length > 0,
      this.areasOfInterest?.length > 0,
      this.currentSkillLevel,
      this.preferredMentoringStyle?.length > 0,
      this.timeCommitmentHoursPerWeek > 0,
    ];
    const filled = requiredFields.filter(Boolean).length;
    return Math.round((filled / requiredFields.length) * 100);
  }
}
