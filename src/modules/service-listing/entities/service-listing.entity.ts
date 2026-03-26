import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, BeforeInsert, BeforeUpdate, Index, ManyToMany, JoinTable } from 'typeorm';
import { IsString, IsNumber, IsOptional, IsEnum, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Tag } from '../../tag/entities/tag.entity';

export enum ServiceCategory {
  TECHNICAL = 'technical',
  BUSINESS = 'business',
  DESIGN = 'design',
  MARKETING = 'marketing',
  CAREER = 'career',
  LANGUAGE = 'language',
  OTHER = 'other'
}

/**
 * Generates an SEO-friendly slug from a string:
 * - Lowercase
 * - Remove special characters
 * - Replace spaces with hyphens
 * - Collapse multiple hyphens
 */
export function generateSlug(text: string): string {
  return text
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/\s+/g, '-')     // Replace spaces with hyphens
    .replace(/-+/g, '-');     // Collapse multiple hyphens
}

@Entity('service_listings')
@Index(['slug'], { unique: true })
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

  @ApiProperty({ description: 'SEO-friendly unique slug' })
  @IsString()
  @Column({ unique: true })
  slug: string;

  @BeforeInsert()
  @BeforeUpdate()
  updateSlug() {
    if (this.title && !this.slug) {
      this.slug = generateSlug(this.title);
    }
  }

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

  @ApiPropertyOptional({ description: 'Average rating for this listing' })
  @Column('decimal', { precision: 3, scale: 2, default: 0 })
  averageRating: number;

  @ApiPropertyOptional({ description: 'Number of reviews for this listing' })
  @Column({ default: 0 })
  reviewCount: number;

  @ApiProperty({ description: 'Soft delete flag' })
  @Column({ default: false })
  isDeleted: boolean;

  @ApiProperty({ description: 'Creation date' })
  @CreateDateColumn()
  createdAt: Date;

  @ApiProperty({ description: 'Last update date' })
  @UpdateDateColumn()
  updatedAt: Date;

  @ApiPropertyOptional({ description: 'Tags associated with this listing', type: [Tag] })
  @IsOptional()
  @IsArray()
  @ManyToMany(() => Tag, tag => tag.serviceListings, { cascade: true })
  @JoinTable({
    name: 'service_listing_tags',
    joinColumn: {
      name: 'service_listing_id',
      referencedColumnName: 'id',
    },
    inverseJoinColumn: {
      name: 'tag_id',
      referencedColumnName: 'id',
    },
  })
  tags?: Tag[];
}
