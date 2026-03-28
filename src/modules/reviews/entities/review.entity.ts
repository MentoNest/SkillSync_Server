import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn, ManyToOne, JoinColumn } from 'typeorm';
import { ServiceListing } from '../../service-listing/entities/service-listing.entity';

@Entity('reviews')
export class Review {
  @ApiProperty({ description: 'Review unique identifier' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: 'Reviewed listing identifier' })
  @Column('uuid')
  listingId: string;

  @ApiPropertyOptional({ description: 'Service listing being reviewed', type: () => ServiceListing })
  @ManyToOne(() => ServiceListing, (listing) => listing.reviews, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'listingId' })
  listing?: ServiceListing;

  @ApiProperty({ description: 'Reviewer identifier' })
  @Column('uuid')
  reviewerId: string;

  @ApiProperty({ description: 'Rating score from 1 to 5', example: 5 })
  @Column({ type: 'int' })
  rating: number;

  @ApiPropertyOptional({ description: 'Optional review comment' })
  @Column('text', { nullable: true })
  comment?: string;

  @ApiProperty({ description: 'Review creation date' })
  @CreateDateColumn()
  createdAt: Date;

  @ApiProperty({ description: 'Review update date' })
  @UpdateDateColumn()
  updatedAt: Date;
}
