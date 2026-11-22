import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('availability_exceptions')
@Index('idx_availability_exceptions_mentor', ['mentorId'])
@Index('idx_availability_exceptions_mentor_date', ['mentorId', 'date'])
@Index('idx_availability_exceptions_mentor_date_unavailable', ['mentorId', 'date', 'isUnavailable'])
export class AvailabilityException {
  @ApiProperty({ description: 'Auto-generated UUID.', example: 'd4e5f6a7-0000-0000-0000-000000000001' })
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ApiProperty({
    description: 'Stellar wallet address of the mentor.',
    example: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37',
  })
  @Column({ name: 'mentor_id', type: 'varchar', length: 56 })
  mentorId!: string;

  @ApiProperty({
    description: 'Specific date this exception applies to, in YYYY-MM-DD format (UTC date).',
    example: '2026-12-25',
  })
  @Column({ name: 'date', type: 'date' })
  date!: string;

  @ApiProperty({
    description: 'Exception start time in UTC, HH:mm 24-hour format.',
    example: '00:00',
  })
  @Column({ name: 'start_time_utc', type: 'time' })
  startTimeUtc!: string;

  @ApiProperty({
    description: 'Exception end time in UTC, HH:mm 24-hour format.',
    example: '23:59',
  })
  @Column({ name: 'end_time_utc', type: 'time' })
  endTimeUtc!: string;

  @ApiPropertyOptional({
    description: 'Reason for the exception (vacation, holiday, etc.).',
    example: 'Holiday',
    nullable: true,
  })
  @Column({ name: 'reason', type: 'varchar', length: 255, nullable: true })
  reason!: string | null;

  @ApiProperty({
    description: 'True if mentor is unavailable for this window; false can represent explicit availability override.',
    example: true,
  })
  @Column({ name: 'is_unavailable', type: 'boolean', default: true })
  isUnavailable!: boolean;

  @ApiProperty({ description: 'UTC creation timestamp.' })
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 3 })
  createdAt!: Date;

  @ApiProperty({ description: 'UTC last-updated timestamp.' })
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz', precision: 3 })
  updatedAt!: Date;
}
