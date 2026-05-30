import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';

@Entity('mentor_profiles')
@Index(['isFeatured', 'featuredOrder'])
@Index(['isFeatured', 'featuredAt'])
@Index(['skills'])
@Index(['hourlyRate'])
@Index(['averageRating'])
export class MentorProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  bio: string;

  @Column('simple-array', { nullable: true })
  skills: string[];

  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  hourlyRate: number;

  @Column({ nullable: true })
  currentRole: string;

  @Column({ nullable: true })
  company: string;

  @Column({ type: 'json', nullable: true })
  education: any[];

  @Column({ type: 'json', nullable: true })
  certifications: any[];

  @Column('simple-array', { nullable: true })
  languages: string[];

  @Column({ nullable: true })
  mentoringStyleDescription: string;

  @Column({ type: 'int', nullable: true })
  yearsOfExperience: number;

  @Column('simple-array', { nullable: true })
  expertise: string[];

  @Column('simple-array', { nullable: true })
  preferredMentoringStyle: string[];

  @Column({ type: 'int', nullable: true })
  availabilityHoursPerWeek: number;

  @Column({ nullable: true })
  availabilityDetails: string;

  @Column({ default: false })
  isFeatured: boolean;

  @Column({ type: 'timestamp', nullable: true })
  featuredAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  featuredExpiresAt: Date;

  @Column({ type: 'int', default: 0 })
  featuredOrder: number;

  @Column({ default: false })
  isVerified: boolean;

  @Column({ type: 'int', default: 0 })
  totalMentoringHours: number;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0 })
  averageRating: number;

  @Column({ type: 'int', default: 0 })
  numberOfReviews: number;

  @OneToOne(() => User, (user) => user.mentorProfile, { onDelete: 'CASCADE' })
  @JoinColumn()
  user: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}