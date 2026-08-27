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
  IsEnum,
  MaxLength,
  Min,
} from 'class-validator';
import { User } from './user.entity';

export enum SkillLevel {
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate',
  ADVANCED = 'advanced',
}

@Entity('mentee_profiles')
export class MenteeProfile {
  @PrimaryGeneratedColumn('uuid')
  @IsUUID()
  @IsOptional()
  id: string;

  @Column({ type: 'uuid', unique: true })
  @IsUUID()
  userId: string;

  @OneToOne(() => User, (user: User) => user.menteeProfile, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column('text', { array: true, default: '{}' })
  @IsArray()
  @IsString({ each: true })
  @MaxLength(500, { each: true })
  @IsOptional()
  learningGoals: string[];

  @Column('text', { array: true, default: '{}' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  areasOfInterest: string[];

  @Column({
    type: 'enum',
    enum: SkillLevel,
    default: SkillLevel.BEGINNER,
  })
  @IsEnum(SkillLevel)
  @IsOptional()
  currentSkillLevel: SkillLevel;

  @Column('text', { array: true, default: '{}' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  preferredMentoringStyle: string[];

  @Column({ type: 'int', default: 0 })
  @IsNumber()
  @Min(0)
  @IsOptional()
  timeCommitment: number; // hours per week

  @Column({ type: 'text', nullable: true })
  @IsString()
  @IsOptional()
  professionalBackground?: string | null;

  @Column({ nullable: true })
  @IsString()
  @IsOptional()
  jobTitle?: string | null;

  @Column({ nullable: true })
  @IsString()
  @IsOptional()
  industry?: string | null;

  @Column('text', { array: true, default: '{}' })
  @IsArray()
  @IsString({ each: true })
  @IsOptional()
  portfolioLinks: string[];

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
      Boolean(this.learningGoals && this.learningGoals.length > 0),
      Boolean(this.areasOfInterest && this.areasOfInterest.length > 0),
      Boolean(this.currentSkillLevel),
      Boolean(this.preferredMentoringStyle && this.preferredMentoringStyle.length > 0),
      Boolean(this.timeCommitment !== undefined && this.timeCommitment > 0),
      Boolean(this.professionalBackground && this.professionalBackground.trim().length > 0),
      Boolean(this.jobTitle && this.jobTitle.trim().length > 0),
      Boolean(this.industry && this.industry.trim().length > 0),
      Boolean(this.portfolioLinks && this.portfolioLinks.length > 0),
    ];

    const completed = fieldsToCheck.filter(Boolean).length;
    this.profileCompletionPercentage = Math.round((completed / fieldsToCheck.length) * 100);
    return this.profileCompletionPercentage;
  }
}
