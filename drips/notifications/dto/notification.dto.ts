import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsEnum,
  IsOptional,
  IsBoolean,
  IsInt,
  Min,
  Max,
} from 'class-validator';
import { Type } from 'class-transformer';
import { NotificationType } from '../entities/notification.entity';

export class NotificationResponseDto {
  @ApiProperty({ example: 'f47ac10b-58cc-4372-a567-0e02b2c3d479' })
  id: string;

  @ApiProperty({ example: 'f47ac10b-58cc-4372-a567-0e02b2c3d480' })
  userId: string;

  @ApiProperty({
    enum: NotificationType,
    example: NotificationType.BOOKING_ACCEPTED,
  })
  type: NotificationType;

  @ApiProperty({
    type: 'object',
    example: {
      bookingId: 'booking-123',
      mentorName: 'Sarah Johnson',
      sessionDate: '2026-02-01T14:00:00Z',
    },
  })
  payload: Record<string, any>;

  @ApiProperty({ example: false })
  isRead: boolean;

  @ApiProperty({ example: '2026-01-26T10:30:00Z' })
  createdAt: Date;

  @ApiProperty({ example: '2026-01-26T10:30:00Z' })
  updatedAt: Date;
}

export class ListNotificationsQueryDto {
  @ApiPropertyOptional({ description: 'Filter by read status' })
  @IsOptional()
  @IsBoolean()
  @Type(() => Boolean)
  read?: boolean;

  @ApiPropertyOptional({ description: 'Page number', minimum: 1, default: 1 })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Type(() => Number)
  page?: number = 1;

  @ApiPropertyOptional({
    description: 'Items per page',
    minimum: 1,
    maximum: 100,
    default: 10,
  })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  @Type(() => Number)
  limit?: number = 10;

  @ApiPropertyOptional({
    enum: NotificationType,
    description: 'Filter by notification type',
  })
  @IsOptional()
  @IsEnum(NotificationType)
  type?: NotificationType;
}

export class PaginatedNotificationsResponseDto {
  @ApiProperty({ type: [NotificationResponseDto] })
  items: NotificationResponseDto[];

  @ApiProperty({ example: 1 })
  page: number;

  @ApiProperty({ example: 10 })
  limit: number;

  @ApiProperty({ example: 42 })
  total: number;

  @ApiProperty({ example: 5 })
  totalPages: number;
}

export class CreateNotificationDto {
  userId: string;
  type: NotificationType;
  payload: Record<string, any>;
}
