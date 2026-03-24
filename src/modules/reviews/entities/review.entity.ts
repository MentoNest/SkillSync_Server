import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

@Entity('reviews')
export class Review {
  @ApiProperty({ description: 'Review unique identifier' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: 'Reviewed listing identifier' })
  @Column('uuid')
  listingId: string;

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
