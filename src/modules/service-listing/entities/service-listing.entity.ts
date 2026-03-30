import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, BeforeInsert, BeforeUpdate, Index, ManyToMany, JoinTable, OneToMany } from 'typeorm';
import { IsString, IsNumber, IsOptional, IsEnum, IsArray } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Tag } from '../../tag/entities/tag.entity';
import { ListingApprovalStatus } from '../../../common/enums/skill-status.enum';
import { CurrencyCode } from '../../../common/enums/currency-code.enum';
import { decimalTransformer } from '../../../common/utils/decimal.transformer';

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

  @BeforeInsert()
  @BeforeUpdate()
  updateExpiry() {
    if (this.duration && this.createdAt) {
      const expiryDate = new Date(this.createdAt);
      // duration is in hours
      expiryDate.setMilliseconds(expiryDate.getMilliseconds() + this.duration * 60 * 60 * 1000);
      this.expiresAt = expiryDate;
    } else if (this.duration) {
      // For new records where createdAt isn't set yet (BeforeInsert)
      const now = new Date();
      now.setMilliseconds(now.getMilliseconds() + this.duration * 60 * 60 * 1000);
      this.expiresAt = now;
    }
  }

  @ApiProperty({ description: 'Service listing description' })
  @IsString()
  @Column('text')
  description: string;

  @ApiProperty({ description: 'Service price' })
  @IsNumber()
  @Column('decimal', { precision: 10, scale: 2, transformer: decimalTransformer })
  price: number;

  @ApiProperty({ description: 'Currency for service price', enum: CurrencyCode })
  @IsEnum(CurrencyCode)
  @Column({
    type: 'enum',
    enum: CurrencyCode,
    default: CurrencyCode.USD,
  })
  currency: CurrencyCode;

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

  @ApiPropertyOptional({ description: 'Whether the listing is in draft mode (not visible publicly)' })
  @Column({ default: false })
  isDraft: boolean;

  @ApiPropertyOptional({ description: 'Average rating for this listing' })
  @Column('decimal', { precision: 3, scale: 2, default: 0, transformer: decimalTransformer })
  averageRating: number;

  @ApiPropertyOptional({ description: 'Number of reviews for this listing' })
  @Column({ default: 0 })
  reviewCount: number;

  @ApiPropertyOptional({ description: 'Maximum number of mentees allowed for this listing' })
  @Column({ nullable: true })
  maxMentees?: number;

  @ApiPropertyOptional({ description: 'Current number of active mentees booked' })
  @Column({ default: 0 })
  currentMenteeCount: number;

  @ApiPropertyOptional({ description: 'Approval status for the listing (requires admin approval before going live)' })
  @IsEnum(ListingApprovalStatus)
  @Column({
    type: 'enum',
    enum: ListingApprovalStatus,
    default: ListingApprovalStatus.PENDING,
  })
  approvalStatus: ListingApprovalStatus;

  @ApiPropertyOptional({ description: 'Reason for rejection (if rejected)' })
  @IsOptional()
  @IsString()
  @Column({ nullable: true })
  rejectionReason?: string;

  @ApiPropertyOptional({ description: 'Admin who approved/rejected the listing' })
  @Column({ nullable: true })
  approvedBy?: string;

  @ApiPropertyOptional({ description: 'Date when the listing was approved/rejected' })
  @Column({ nullable: true })
  approvedAt?: Date;

  @ApiPropertyOptional({ description: 'Number of views for this listing' })
  @Column({ default: 0 })
  viewCount: number;

  @ApiPropertyOptional({ description: 'Number of clicks for this listing' })
  @Column({ default: 0 })
  clickCount: number;

  @ApiPropertyOptional({ description: 'Number of conversions (bookings) for this listing' })
  @Column({ default: 0 })
  conversionCount: number;

  @ApiPropertyOptional({ description: 'Trending score calculated from activity metrics' })
  @Column('decimal', { precision: 10, scale: 4, default: 0, transformer: decimalTransformer })
  trendingScore: number;

  @ApiPropertyOptional({ description: 'SEO meta title for search engines' })
  @IsOptional()
  @IsString()
  @Column({ length: 500, nullable: true })
  metaTitle?: string;

  @ApiPropertyOptional({ description: 'SEO meta description for search engines' })
  @IsOptional()
  @IsString()
  @Column({ type: 'text', nullable: true })
  metaDescription?: string;

  @ApiPropertyOptional({ description: 'SEO meta keywords for search engines (comma-separated)' })
  @IsOptional()
  @IsString()
  @Column({ length: 1000, nullable: true })
  metaKeywords?: string;

  @ApiProperty({ description: 'Soft delete flag' })
  @Column({ default: false })
  isDeleted: boolean;

  @ApiPropertyOptional({ description: 'Expiration date of the listing' })
  @Column({ nullable: true })
  expiresAt: Date;

  @ApiProperty({ description: 'Creation date' })
  @CreateDateColumn()
  createdAt: Date;

  @ApiProperty({ description: 'Last update date' })
  @UpdateDateColumn()
  updatedAt: Date;

  @ApiPropertyOptional({ description: 'Full-text search vector (PostgreSQL tsvector)' })
  @Column({ type: 'tsvector', nullable: true, select: false })
  searchVector?: string;

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

  @ApiPropertyOptional({ description: 'Reviews for this listing', type: 'array' })
  @IsOptional()
  @IsArray()
  @OneToMany(() => (require('../../reviews/entities/review.entity').Review), (review: any) => review.listing, { cascade: true })
  reviews?: any[];
}
