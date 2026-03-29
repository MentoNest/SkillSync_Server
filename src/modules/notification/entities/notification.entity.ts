import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

export enum NotificationType {
	LISTING_CREATED = 'listing_created',
	LISTING_UPDATED = 'listing_updated',
	LISTING_APPROVED = 'listing_approved',
	LISTING_REJECTED = 'listing_rejected',
}

@Entity('notifications')
@Index(['userId', 'createdAt'])
export class Notification {
	@ApiProperty({ description: 'Notification id' })
	@PrimaryGeneratedColumn('uuid')
	id: string;

	@ApiProperty({ description: 'User id that should receive the notification' })
	@Column()
	userId: string;

	@ApiProperty({ enum: NotificationType, description: 'Notification type' })
	@Column({
		type: 'enum',
		enum: NotificationType,
	})
	type: NotificationType;

	@ApiProperty({ description: 'Short title for notification list views' })
	@Column({ length: 160 })
	title: string;

	@ApiProperty({ description: 'Notification body message' })
	@Column({ type: 'text' })
	message: string;

	@ApiPropertyOptional({ description: 'Optional structured payload for deep linking/context' })
	@Column({ type: 'jsonb', nullable: true })
	metadata?: Record<string, unknown>;

	@ApiProperty({ description: 'Whether this notification has been read' })
	@Column({ default: false })
	isRead: boolean;

	@ApiPropertyOptional({ description: 'Time this notification was marked as read' })
	@Column({ type: 'timestamp', nullable: true })
	readAt?: Date;

	@ApiProperty({ description: 'Created at timestamp' })
	@CreateDateColumn()
	createdAt: Date;

	@ApiProperty({ description: 'Updated at timestamp' })
	@UpdateDateColumn()
	updatedAt: Date;
}
