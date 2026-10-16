import {
  Check,
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

export interface EducationEntry {
  institution: string;
  degree?: string;
  field?: string;
  startYear?: number;
  endYear?: number;
}

export interface CertificationEntry {
  name: string;
  issuer?: string;
  year?: number;
  url?: string;
}

export const MAX_SKILLS = 20;
export const MIN_HOURLY_RATE = 0;
export const MAX_HOURLY_RATE = 1000;
export const MAX_BIO_LENGTH = 1000;

/** Mentor-specific details, one per user. Deleted together with the user. */
@Entity('mentor_profiles')
@Index('IDX_mentor_profiles_user_id', ['userId'], { unique: true })
@Index('IDX_mentor_profiles_hourly_rate', ['hourlyRate'])
@Index('IDX_mentor_profiles_average_rating', ['averageRating'])
@Check('CHK_mentor_profiles_hourly_rate', `"hourly_rate" >= ${MIN_HOURLY_RATE} AND "hourly_rate" <= ${MAX_HOURLY_RATE}`)
export class MentorProfile {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @OneToOne(() => User, (user) => user.mentorProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @Column({ type: 'varchar', length: MAX_BIO_LENGTH, nullable: true })
  bio!: string | null;

  /** Indexed with GIN in the migration so skills can be searched. */
  @Column({ type: 'text', array: true, default: () => "'{}'" })
  skills!: string[];

  @Column({ name: 'hourly_rate', type: 'decimal', precision: 8, scale: 2, default: 0 })
  hourlyRate!: number;

  @Column({ name: 'expertise_areas', type: 'text', array: true, default: () => "'{}'" })
  expertiseAreas!: string[];

  @Column({ name: 'years_of_experience', type: 'int', default: 0 })
  yearsOfExperience!: number;

  @Column({ name: 'current_role', type: 'varchar', length: 120, nullable: true })
  currentRole!: string | null;

  @Column({ type: 'varchar', length: 120, nullable: true })
  company!: string | null;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  education!: EducationEntry[];

  @Column({ type: 'jsonb', default: () => "'[]'" })
  certifications!: CertificationEntry[];

  @Column({ type: 'text', array: true, default: () => "'{}'" })
  languages!: string[];

  @Column({ name: 'mentoring_style', type: 'varchar', length: 1000, nullable: true })
  mentoringStyle!: string | null;

  @Column({ name: 'is_verified', type: 'boolean', default: false })
  isVerified!: boolean;

  @Column({ name: 'total_mentoring_hours', type: 'decimal', precision: 10, scale: 2, default: 0 })
  totalMentoringHours!: number;

  @Column({ name: 'average_rating', type: 'decimal', precision: 3, scale: 2, default: 0 })
  averageRating!: number;

  @Column({ name: 'review_count', type: 'int', default: 0 })
  reviewCount!: number;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
