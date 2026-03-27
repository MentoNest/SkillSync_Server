import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { IsString, IsOptional, IsArray, IsNumber, IsUrl, IsBoolean, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { User } from '../../user/entities/user.entity';

export enum ListingStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  SUSPENDED = 'suspended',
  DUPLICATE = 'duplicate',
}

export enum ListingType {
  MENTORSHIP = 'mentorship',
  COLLABORATION = 'collaboration',
  FREELANCE = 'freelance',
}

@Entity('listings')
@Index(['userId', 'status'])
@Index(['title', 'type'])
@Index(['skills'])
export class Listing {
  @ApiProperty({ description: 'Listing unique identifier' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: 'User who created this listing' })
  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn()
  user: User;

  @ApiProperty({ description: 'User ID reference' })
  @Column({ nullable: false })
  userId: string;

  @ApiPropertyOptional({ description: 'Listing title', example: 'Senior React Developer offering mentorship' })
  @IsOptional()
  @IsString()
  @Column({ nullable: true })
  title?: string;

  @ApiPropertyOptional({ description: 'Detailed description of the listing', example: 'Experienced developer offering personalized mentorship in React, TypeScript, and modern web development.' })
  @IsOptional()
  @IsString()
  @Column({ type: 'text', nullable: true })
  description?: string;

  @ApiProperty({ description: 'Type of listing', enum: ListingType })
  @IsEnum(ListingType)
  @Column({ type: 'enum', enum: ListingType, default: ListingType.MENTORSHIP })
  type: ListingType;

  @ApiPropertyOptional({ description: 'Skills or expertise offered', example: ['React', 'TypeScript', 'Node.js'] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  @Column('simple-array', { nullable: true })
  skills?: string[];

  @ApiPropertyOptional({ description: 'Hourly rate', example: 50 })
  @IsOptional()
  @IsNumber()
  @Column({ type: 'decimal', precision: 10, scale: 2, nullable: true })
  hourlyRate?: number;

  @ApiPropertyOptional({ description: 'Whether the listing is currently available' })
  @IsOptional()
  @IsBoolean()
  @Column({ default: true })
  isAvailable: boolean;

  @ApiProperty({ description: 'Listing status', enum: ListingStatus })
  @IsEnum(ListingStatus)
  @Column({ type: 'enum', enum: ListingStatus, default: ListingStatus.ACTIVE })
  status: ListingStatus;

  @ApiPropertyOptional({ description: 'Profile image URL' })
  @IsOptional()
  @IsUrl()
  @Column({ nullable: true })
  profileImageUrl?: string;

  @ApiPropertyOptional({ description: 'Hash for duplicate detection (based on content)' })
  @IsOptional()
  @IsString()
  @Column({ nullable: true, select: false })
  contentHash?: string;

  @ApiPropertyOptional({ description: 'Similar listing IDs (for tracking duplicates)' })
  @IsOptional()
  @IsArray()
  @Column('simple-array', { nullable: true })
  similarListingIds?: string[];

  @ApiPropertyOptional({ description: 'Duplicate detection score (0-1)' })
  @IsOptional()
  @IsNumber()
  @Column({ type: 'decimal', precision: 3, scale: 2, default: 0, select: false })
  similarityScore?: number;

  @ApiProperty({ description: 'Listing creation date' })
  @CreateDateColumn()
  createdAt: Date;

  @ApiProperty({ description: 'Last profile update date' })
  @UpdateDateColumn()
  updatedAt: Date;
}
