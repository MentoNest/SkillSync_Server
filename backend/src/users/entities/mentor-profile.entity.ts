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

@Entity({ name: 'mentor_profiles' })
export class MentorProfile {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text', nullable: false })
  bio!: string;

  @Column('simple-array', { nullable: true })
  expertise?: string[];

  @Column({ type: 'int', nullable: false })
  yearsOfExperience!: number;

  @Column('simple-array', { nullable: true })
  preferredMentoringStyle?: string[];

  @Column({ type: 'int', nullable: true })
  availabilityHoursPerWeek?: number;

  @Column({ type: 'text', nullable: true })
  availabilityDetails?: string;

  @Column({ name: 'hourly_rate', type: 'decimal', precision: 10, scale: 2, nullable: true })
  hourlyRate?: number;

  @Column({ name: 'average_rating', type: 'decimal', precision: 3, scale: 2, default: 0 })
  averageRating: number = 0;

  @Column({ name: 'total_sessions', type: 'int', default: 0 })
  totalSessions: number = 0;

  @Column({ name: 'is_verified', type: 'boolean', default: false })
  isVerified: boolean = false;

  @Column({ name: 'profile_completeness', type: 'int', default: 0 })
  profileCompleteness: number = 0;

  @Column({ name: 'profile_version', type: 'int', default: 1 })
  profileVersion!: number;

  @OneToOne(() => User, (user) => user.mentorProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
