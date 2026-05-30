import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity({ name: 'mentee_profiles' })
export class MenteeProfile {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text', nullable: false })
  learningGoals!: string;

  @Column('simple-array', { nullable: true })
  areasOfInterest?: string[];

  @Column({ type: 'varchar', length: 255, nullable: false })
  currentSkillLevel!: string;

  @Column('simple-array', { nullable: true })
  preferredMentoringStyle?: string[];

  @Column({ type: 'int', nullable: false })
  timeCommitmentHoursPerWeek!: number;

  @Column({ type: 'text', nullable: true })
  professionalBackground?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  jobTitle?: string;

  @Column({ type: 'varchar', length: 255, nullable: true })
  industry?: string;

  @Column('simple-array', { nullable: true })
  portfolioLinks?: string[];

  @OneToOne(() => User, (user) => user.menteeProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
