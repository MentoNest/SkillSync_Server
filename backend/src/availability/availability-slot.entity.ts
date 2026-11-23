import { ApiProperty } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('availability_slots')
@Index('idx_availability_slots_mentor', ['mentorId'])
@Index('idx_availability_slots_mentor_day', ['mentorId', 'dayOfWeek'])
@Index('idx_availability_slots_mentor_day_time', ['mentorId', 'dayOfWeek', 'startTimeUtc'])
@Index('idx_availability_slots_mentor_created', ['mentorId', 'createdAt'])
export class AvailabilitySlot {
  @ApiProperty({ description: 'Auto-generated UUID.', example: 'c3d4e5f6-0000-0000-0000-000000000001' })
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ApiProperty({
    description: 'Stellar wallet address of the mentor.',
    example: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37',
  })
  @Column({ name: 'mentor_id', type: 'varchar', length: 56 })
  mentorId!: string;

  @ApiProperty({
    description: 'Day of week as 0-6, where 0 is Sunday and 6 is Saturday.',
    example: 1,
    minimum: 0,
    maximum: 6,
  })
  @Column({ name: 'day_of_week', type: 'smallint' })
  dayOfWeek!: number;

  @ApiProperty({
    description: 'Slot start time in UTC, HH:mm 24-hour format.',
    example: '10:00',
  })
  @Column({ name: 'start_time_utc', type: 'time' })
  startTimeUtc!: string;

  @ApiProperty({
    description: 'Slot end time in UTC, HH:mm 24-hour format.',
    example: '12:00',
  })
  @Column({ name: 'end_time_utc', type: 'time' })
  endTimeUtc!: string;

  @ApiProperty({
    description: 'IANA timezone used for display/conversion, e.g. "Africa/Lagos".',
    example: 'UTC',
  })
  @Column({ name: 'timezone', type: 'varchar', length: 64, default: 'UTC' })
  timezone!: string;

  @ApiProperty({ description: 'UTC creation timestamp.' })
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 3 })
  createdAt!: Date;

  @ApiProperty({ description: 'UTC last-updated timestamp.' })
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz', precision: 3 })
  updatedAt!: Date;
}
