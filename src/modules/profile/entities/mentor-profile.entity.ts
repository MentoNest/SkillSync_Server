import { Entity, PrimaryGeneratedColumn, Column, OneToOne, JoinColumn, CreateDateColumn, UpdateDateColumn, OneToMany } from 'typeorm';
import { MentorSkill } from '../../mentor_skills/entities/mentor-skill.entity';
import { IsString, IsOptional, IsArray, IsNumber, IsUrl } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { User } from '../../user/entities/user.entity';

@Entity('mentor_profiles')
export class MentorProfile {
  @ApiProperty({ description: 'Mentor profile unique identifier' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: 'Linked user account' })
  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn()
  user: User;

  @ApiPropertyOptional({ description: 'Professional bio', example: 'Experienced software engineer with 10+ years in web development' })
  @IsOptional()
  @IsString()
  @Column({ type: 'text', nullable: true })
  bio?: string;

  @OneToMany(() => MentorSkill, mentorSkill => mentorSkill.mentor)
  mentorSkills: MentorSkill[];

  @ApiPropertyOptional({ description: 'Years of experience', example: 5 })
  @IsOptional()
  @IsNumber()
  @Column({ nullable: true })
  experienceYears?: number;

  @ApiPropertyOptional({ description: 'Job title or position', example: 'Senior Software Engineer' })
  @IsOptional()
  @IsString()
  @Column({ nullable: true })
  title?: string;

  @ApiPropertyOptional({ description: 'Company name', example: 'Tech Corp' })
  @IsOptional()
  @IsString()
  @Column({ nullable: true })
  company?: string;

  @ApiPropertyOptional({ description: 'LinkedIn profile URL' })
  @IsOptional()
  @IsUrl()
  @Column({ nullable: true })
  linkedinUrl?: string;

  @ApiPropertyOptional({ description: 'Portfolio or personal website URL' })
  @IsOptional()
  @IsUrl()
  @Column({ nullable: true })
  portfolioUrl?: string;

  @ApiPropertyOptional({
    description: 'List of portfolio or project URLs',
    example: ['https://github.com/user', 'https://myproject.dev'],
  })
  @IsOptional()
  @IsArray()
  @IsUrl({}, { each: true })
  @Column('text', { array: true, nullable: true })
  portfolioLinks?: string[];

  @ApiPropertyOptional({ description: 'Hourly rate', example: 50 })
  @IsOptional()
  @IsNumber()
  @Column({ nullable: true })
  hourlyRate?: number;

  @ApiPropertyOptional({ description: 'Profile image URL' })
  @IsOptional()
  @IsUrl()
  @Column({ nullable: true })
  profileImageUrl?: string;

  @ApiPropertyOptional({ description: 'Is profile available for mentoring' })
  @Column({ default: true })
  isAvailable: boolean;

  @ApiPropertyOptional({ description: 'Is mentor profile verified by admin' })
  @Column({ default: false })
  isVerified: boolean;

  @ApiPropertyOptional({
    description: 'IANA timezone identifier for the mentor (e.g. "America/New_York")',
    example: 'America/New_York',
  })
  @Column({ type: 'varchar', default: 'UTC' })
  timezone: string;

  @ApiProperty({ description: 'Profile creation date' })
  @CreateDateColumn()
  createdAt: Date;

  @ApiProperty({ description: 'Last profile update date' })
  @UpdateDateColumn()
  updatedAt: Date;
}
