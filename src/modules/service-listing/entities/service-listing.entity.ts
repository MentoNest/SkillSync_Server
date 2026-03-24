import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { IsString, IsNumber, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum ServiceCategory {
  TECHNICAL = 'technical',
  BUSINESS = 'business',
  DESIGN = 'design',
  MARKETING = 'marketing',
  CAREER = 'career',
  LANGUAGE = 'language',
  OTHER = 'other'
}

@Entity('service_listings')
export class ServiceListing {
  @ApiProperty({ description: 'Service listing unique identifier' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: 'Mentor ID who created this listing' })
  @Column()
  mentorId: string;

  @ApiProperty({ description: 'Service listing title' })
  @IsString()
  @Column()
  title: string;

  @ApiProperty({ description: 'Service listing description' })
  @IsString()
  @Column('text')
  description: string;

  @ApiProperty({ description: 'Service price' })
  @IsNumber()
  @Column('decimal', { precision: 10, scale: 2 })
  price: number;

  @ApiPropertyOptional({ description: 'Service duration in hours' })
  @IsOptional()
  @IsNumber()
  @Column({ nullable: true })
  duration?: number;

  @ApiProperty({ description: 'Service category' })
  @IsEnum(ServiceCategory)
  @Column({
    type: 'enum',
    enum: ServiceCategory,
  })
  category: ServiceCategory;

  @ApiPropertyOptional({ description: 'Service listing image URL' })
  @IsOptional()
  @IsString()
  @Column({ nullable: true })
  imageUrl?: string;

  @ApiPropertyOptional({ description: 'Is service listing active' })
  @Column({ default: true })
  isActive: boolean;

  @ApiPropertyOptional({ description: 'Whether the listing is featured' })
  @Column({ default: false })
  isFeatured: boolean;

  @ApiProperty({ description: 'Soft delete flag' })
  @Column({ default: false })
  isDeleted: boolean;

  @ApiProperty({ description: 'Creation date' })
  @CreateDateColumn()
  createdAt: Date;

  @ApiProperty({ description: 'Last update date' })
  @UpdateDateColumn()
  updatedAt: Date;
}
