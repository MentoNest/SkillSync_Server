import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { IsString, IsOptional, IsArray, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { User } from '../../user/entities/user.entity';

export enum MenteeGoal {
  CAREER_CHANGE = 'career_change',
  SKILL_IMPROVEMENT = 'skill_improvement',
  STARTUP_GUIDANCE = 'startup_guidance',
  PERSONAL_DEVELOPMENT = 'personal_development',
  TECHNICAL_SKILLS = 'technical_skills',
  LEADERSHIP = 'leadership',
  OTHER = 'other'
}

@Entity('mentee_profiles')
export class MenteeProfile {
  @ApiProperty({ description: 'Mentee profile unique identifier' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: 'Linked user account' })
  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn()
  user: User;

  @ApiPropertyOptional({ description: 'Personal bio or introduction', example: 'Aspiring developer looking to transition into tech' })
  @IsOptional()
  @IsString()
  @Column({ type: 'text', nullable: true })
  bio?: string;

  @ApiPropertyOptional({ description: 'Areas of interest for learning', example: ['Web Development', 'Data Science', 'Machine Learning'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Column('text', { array: true, nullable: true })
  interests?: string[];

  @ApiPropertyOptional({ description: 'Learning goals', enum: MenteeGoal })
  @IsOptional()
  @IsEnum(MenteeGoal)
  @Column({ type: 'enum', enum: MenteeGoal, nullable: true })
  primaryGoal?: MenteeGoal;

  @ApiPropertyOptional({ description: 'Additional goals or specific learning objectives', example: ['Learn React', 'Build portfolio projects', 'Get first tech job'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Column('text', { array: true, nullable: true })
  goals?: string[];

  @ApiPropertyOptional({ description: 'Current skill level', example: 'Beginner' })
  @IsOptional()
  @IsString()
  @Column({ nullable: true })
  skillLevel?: string;

  @ApiPropertyOptional({ description: 'Preferred learning style', example: 'Hands-on projects' })
  @IsOptional()
  @IsString()
  @Column({ nullable: true })
  learningStyle?: string;

  @ApiPropertyOptional({ description: 'Time availability per week (hours)', example: 10 })
  @IsOptional()
  @Column({ nullable: true })
  weeklyAvailability?: number;

  @ApiPropertyOptional({ description: 'Profile image URL' })
  @IsOptional()
  @IsString()
  @Column({ nullable: true })
  profileImageUrl?: string;

  @ApiPropertyOptional({ description: 'Is profile actively seeking mentorship' })
  @Column({ default: true })
  isSeekingMentor: boolean;

  @ApiProperty({ description: 'Profile creation date' })
  @CreateDateColumn()
  createdAt: Date;

  @ApiProperty({ description: 'Last profile update date' })
  @UpdateDateColumn()
  updatedAt: Date;
}
