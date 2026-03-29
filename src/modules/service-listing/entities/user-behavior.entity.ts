import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { User } from '../../user/entities/user.entity';
import { ServiceListing } from '../../service-listing/entities/service-listing.entity';

export enum BehaviorType {
  VIEW = 'view',
  CLICK = 'click',
  BOOKMARK = 'bookmark',
  BOOKING = 'booking',
  REVIEW = 'review',
  WISHLIST_ADD = 'wishlist_add',
  WISHLIST_REMOVE = 'wishlist_remove',
}

@Entity('user_behavior')
@Index(['userId', 'listingId', 'behaviorType'])
@Index(['userId', 'createdAt'])
@Index(['listingId', 'behaviorType'])
export class UserBehavior {
  @ApiProperty({ description: 'Behavior record unique identifier' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: 'User who performed the action' })
  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @ApiProperty({ description: 'User ID' })
  @Column('uuid')
  userId: string;

  @ApiProperty({ description: 'Service listing that was interacted with' })
  @ManyToOne(() => ServiceListing, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'listingId' })
  listing: ServiceListing;

  @ApiProperty({ description: 'Listing ID' })
  @Column('uuid')
  listingId: string;

  @ApiProperty({ description: 'Type of behavior', enum: BehaviorType })
  @Column({
    type: 'enum',
    enum: BehaviorType,
  })
  behaviorType: BehaviorType;

  @ApiPropertyOptional({ description: 'Additional metadata (e.g., rating for review)' })
  @Column('simple-json', { nullable: true })
  metadata?: Record<string, any>;

  @ApiProperty({ description: 'When this behavior was recorded' })
  @CreateDateColumn()
  createdAt: Date;
}
