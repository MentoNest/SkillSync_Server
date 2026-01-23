import { ApiProperty } from '@nestjs/swagger';
import { SessionStatus } from '../entities/session.entity';

export class SessionResponseDto {
  @ApiProperty({
    description: 'Session ID',
    example: '550e8400-e29b-41d4-a716-446655440000',
  })
  id!: string;

  @ApiProperty({
    description: 'Booking ID',
    example: '550e8400-e29b-41d4-a716-446655440001',
  })
  bookingId!: string;

  @ApiProperty({
    description: 'Mentor profile ID',
    example: '550e8400-e29b-41d4-a716-446655440002',
  })
  mentorProfileId!: string;

  @ApiProperty({
    description: 'Mentee user ID',
    example: '550e8400-e29b-41d4-a716-446655440003',
  })
  menteeUserId!: string;

  @ApiProperty({
    description: 'Session start time',
    example: '2026-01-22T10:00:00Z',
  })
  startTime!: Date;

  @ApiProperty({
    description: 'Session end time',
    example: '2026-01-22T11:00:00Z',
  })
  endTime!: Date;

  @ApiProperty({
    description: 'Current session status',
    enum: SessionStatus,
    example: SessionStatus.SCHEDULED,
  })
  status!: SessionStatus;

  @ApiProperty({
    description: 'Optional session notes',
    nullable: true,
  })
  notes?: string;

  @ApiProperty({
    description: 'Session metadata (reserved for future use)',
    type: Object,
    nullable: true,
  })
  metadata?: Record<string, any>;

  @ApiProperty({
    description: 'Session creation timestamp',
    example: '2026-01-22T08:00:00Z',
  })
  createdAt!: Date;

  @ApiProperty({
    description: 'Session last update timestamp',
    example: '2026-01-22T08:00:00Z',
  })
  updatedAt!: Date;
}
