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
import { User } from './user.entity.js';

@Entity('mentor_profiles')
export class MentorProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @OneToOne(() => User, (user) => user.mentorProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  userId: string;

  @Column({ type: 'text', nullable: true })
  bio: string;

  @Index()
  @Column('simple-array', { default: '' })
  skills: string[];

  @Index()
  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  hourlyRate: number;

  @Column('simple-array', { default: '' })
  expertiseAreas: string[];

  @Column({ type: 'int', default: 0 })
  yearsOfExperience: number;

  @Column({ type: 'varchar', nullable: true })
  currentRole: string;

  @Column({ type: 'varchar', nullable: true })
  company: string;

  @Column({ type: 'jsonb', nullable: true })
  education: Record<string, any>[];

  @Column({ type: 'jsonb', nullable: true })
  certifications: Record<string, any>[];

  @Column('simple-array', { default: '' })
  languages: string[];

  @Column({ type: 'text', nullable: true })
  mentoringStyleDescription: string;

  @Column({ type: 'boolean', default: false })
  isVerified: boolean;

  @Column({ type: 'int', default: 0 })
  totalMentoringHours: number;

  @Index()
  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0 })
  averageRating: number;

  @Column({ type: 'int', default: 0 })
  numberOfReviews: number;

  @Column({ type: 'int', default: 1 })
  profileVersion: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  get profileCompletion(): number {
    const requiredFields = [
      this.bio,
      this.skills?.length > 0,
      this.expertiseAreas?.length > 0,
      this.yearsOfExperience > 0,
      this.currentRole,
      this.hourlyRate > 0,
    ];
    const filled = requiredFields.filter(Boolean).length;
    return Math.round((filled / requiredFields.length) * 100);
  }
}
