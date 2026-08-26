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
import {
  IsUUID,
  IsString,
  IsOptional,
  IsNumber,
  IsArray,
  IsBoolean,
  Min,
  Max,
  MaxLength,
  ArrayMaxSize,
} from 'class-validator';
import { User } from './user.entity';

@Entity('mentor_profiles')
@Index('IDX_mentor_profiles_skills', ['skills'])
@Index('IDX_mentor_profiles_hourlyRate', ['hourlyRate'])
@Index('IDX_mentor_profiles_averageRating', ['averageRating'])
export class MentorProfile {
  @PrimaryGeneratedColumn('uuid')
  @IsUUID()
  @IsOptional()
  id: string;

  @Column({ type: 'uuid', unique: true })
  @IsUUID()
  userId: string;

  @OneToOne(() => User, (user: User) => user.mentorProfile, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'text', nullable: true })
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  bio?: string | null;

  @Column('text', { array: true, default: '{}' })
  @IsArray()
  @IsString({ each: true })
  @ArrayMaxSize(20)
  @IsOptional()
  skills: string[];

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  @IsNumber()
  @Min(0)
  @Max(1000)
  @IsOptional()
  hourlyRate: number;

  @Column('text', { array: true, default: '{}' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  expertiseAreas: string[];

  @Column({ type: 'int', default: 0 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  yearsOfExperience: number;

  @Column({ nullable: true })
  @IsString()
  @IsOptional()
  currentRole?: string | null;

  @Column({ nullable: true })
  @IsString()
  @IsOptional()
  company?: string | null;

  @Column({ type: 'jsonb', default: '[]' })
  @IsArray()
  @IsOptional()
  education: Array<{
    school: string;
    degree: string;
    fieldOfStudy?: string;
    startYear?: number;
    endYear?: number;
  }>;

  @Column({ type: 'jsonb', default: '[]' })
  @IsArray()
  @IsOptional()
  certifications: Array<{
    title: string;
    issuer: string;
    issueDate?: string;
    credentialUrl?: string;
  }>;

  @Column('text', { array: true, default: '{}' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  languagesSpoken: string[];

  @Column({ type: 'text', nullable: true })
  @IsString()
  @IsOptional()
  mentoringStyle?: string | null;

  @Column({ type: 'boolean', default: false })
  @IsBoolean()
  @IsOptional()
  isVerified: boolean;

  @Column({ type: 'decimal', precision: 10, scale: 2, default: 0 })
  @IsNumber()
  @IsOptional()
  totalMentoringHours: number;

  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0 })
  @IsNumber()
  @IsOptional()
  averageRating: number;

  @Column({ type: 'int', default: 0 })
  @IsNumber()
  @IsOptional()
  numberOfReviews: number;

  @Column({ type: 'int', default: 0 })
  @IsNumber()
  @IsOptional()
  profileCompletionPercentage: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  calculateProfileCompletion(): number {
    const fieldsToCheck = [
      Boolean(this.bio && this.bio.trim().length > 0),
      Boolean(this.skills && this.skills.length > 0),
      Boolean(this.hourlyRate !== undefined && this.hourlyRate !== null),
      Boolean(this.expertiseAreas && this.expertiseAreas.length > 0),
      Boolean(this.yearsOfExperience !== undefined && this.yearsOfExperience > 0),
      Boolean(this.currentRole && this.currentRole.trim().length > 0),
      Boolean(this.company && this.company.trim().length > 0),
      Boolean(this.education && this.education.length > 0),
      Boolean(this.certifications && this.certifications.length > 0),
      Boolean(this.languagesSpoken && this.languagesSpoken.length > 0),
      Boolean(this.mentoringStyle && this.mentoringStyle.trim().length > 0),
    ];

    const completed = fieldsToCheck.filter(Boolean).length;
    this.profileCompletionPercentage = Math.round((completed / fieldsToCheck.length) * 100);
    return this.profileCompletionPercentage;
  }
}
