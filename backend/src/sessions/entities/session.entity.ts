import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { SessionStatus } from '../session-rules';

@Entity('sessions')
@Index('idx_sessions_mentor_start', ['mentorId', 'startTime'])
@Index('idx_sessions_mentee_start', ['menteeId', 'startTime'])
@Index('idx_sessions_status_start', ['status', 'startTime'])
@Index('idx_sessions_mentor_status_start', ['mentorId', 'status', 'startTime'])
export class Session {
  @ApiProperty({
    description: 'Auto-generated UUID.',
    example: 'c3d4e5f6-0000-0000-0000-000000000001',
  })
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ApiProperty({
    description: 'Stellar wallet address of the mentor.',
    example: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37',
  })
  @Column({ name: 'mentor_id', type: 'varchar', length: 56 })
  mentorId!: string;

  @ApiProperty({
    description: 'Stellar wallet address of the mentee.',
    example: 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37',
  })
  @Column({ name: 'mentee_id', type: 'varchar', length: 56 })
  menteeId!: string;

  @ApiProperty({
    description: 'Session start in UTC.',
    example: '2030-01-02T10:00:00.000Z',
  })
  @Column({ name: 'start_time', type: 'timestamptz', precision: 3 })
  startTime!: Date;

  @ApiProperty({
    description: 'Session end in UTC.',
    example: '2030-01-02T11:00:00.000Z',
  })
  @Column({ name: 'end_time', type: 'timestamptz', precision: 3 })
  endTime!: Date;

  @ApiProperty({ enum: SessionStatus, default: SessionStatus.PENDING })
  @Column({
    name: 'status',
    type: 'enum',
    enum: SessionStatus,
    enumName: 'sessions_status_enum',
    default: SessionStatus.PENDING,
  })
  status!: SessionStatus;

  @ApiPropertyOptional({
    description: 'Meeting link for the session.',
    nullable: true,
  })
  @Column({
    name: 'meeting_url',
    type: 'varchar',
    length: 2048,
    nullable: true,
  })
  meetingUrl!: string | null;

  @ApiPropertyOptional({
    description: 'Notes from the booking request.',
    nullable: true,
  })
  @Column({ name: 'notes', type: 'text', nullable: true })
  notes!: string | null;

  @ApiPropertyOptional({
    description: 'Rating from 1 to 5.',
    minimum: 1,
    maximum: 5,
    nullable: true,
  })
  @Column({ name: 'rating', type: 'smallint', nullable: true })
  rating!: number | null;

  @ApiPropertyOptional({
    description: 'Review left by the mentee.',
    nullable: true,
  })
  @Column({ name: 'review', type: 'text', nullable: true })
  review!: string | null;

  @ApiPropertyOptional({
    description: 'Reason the session was cancelled.',
    nullable: true,
  })
  @Column({
    name: 'cancellation_reason',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  cancellationReason!: string | null;

  @ApiPropertyOptional({
    description: 'UTC timestamp when the reminder was sent.',
    nullable: true,
  })
  @Column({
    name: 'reminder_sent_at',
    type: 'timestamptz',
    precision: 3,
    nullable: true,
  })
  reminderSentAt!: Date | null;

  @ApiProperty({ description: 'UTC creation timestamp.' })
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 3 })
  createdAt!: Date;

  @ApiProperty({ description: 'UTC last-updated timestamp.' })
  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz', precision: 3 })
  updatedAt!: Date;
}
