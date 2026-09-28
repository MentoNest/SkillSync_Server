import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { IsUUID, IsInt, Min, Max, IsString, Matches } from 'class-validator';

/**
 * Fix #1169: weekly recurring availability slot for a mentor.
 * Times are stored in UTC ('HH:mm') alongside the mentor's timezone
 * so slots can be rendered back in local time.
 */
@Entity('availability_slots')
@Index('IDX_availability_slots_mentorId', ['mentorId'])
@Index('IDX_availability_slots_mentorId_dayOfWeek', ['mentorId', 'dayOfWeek'])
export class AvailabilitySlot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  @IsUUID()
  mentorId: string;

  @Column({ type: 'int' })
  @IsInt()
  @Min(0)
  @Max(6)
  dayOfWeek: number; // 0 = Sunday .. 6 = Saturday

  @Column({ type: 'varchar', length: 5 })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  startTime: string; // UTC 'HH:mm'

  @Column({ type: 'varchar', length: 5 })
  @IsString()
  @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  endTime: string; // UTC 'HH:mm'

  @Column({ type: 'varchar', default: 'UTC' })
  @IsString()
  timezone: string;

  @CreateDateColumn()
  createdAt: Date;
}