import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  Unique,
  Index,
} from 'typeorm';
import { IsString, IsOptional } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { User } from '../../user/entities/user.entity';
import { Listing } from './listing.entity';

@Entity('bookmarks')
@Unique(['user', 'listing'])
@Index(['userId'])
@Index(['listingId'])
export class Bookmark {
  @ApiProperty({ description: 'Bookmark unique identifier' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: 'User who saved this bookmark' })
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn()
  user: User;

  @ApiProperty({ description: 'User ID reference' })
  @Column({ nullable: false })
  userId: string;

  @ApiProperty({ description: 'Listing that was bookmarked' })
  @ManyToOne(() => Listing, { onDelete: 'CASCADE' })
  @JoinColumn()
  listing: Listing;

  @ApiProperty({ description: 'Listing ID reference' })
  @Column({ nullable: false })
  listingId: string;

  @ApiPropertyOptional({ description: 'Optional notes for the bookmark', example: 'Great potential mentor for React' })
  @IsOptional()
  @IsString()
  @Column({ type: 'text', nullable: true })
  notes?: string;

  @ApiProperty({ description: 'Bookmark creation date' })
  @CreateDateColumn()
  createdAt: Date;
}
