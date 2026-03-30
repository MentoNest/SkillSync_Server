import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

export enum DayOfWeek {
  SUNDAY = 0,
  MONDAY = 1,
  TUESDAY = 2,
  WEDNESDAY = 3,
  THURSDAY = 4,
  FRIDAY = 5,
  SATURDAY = 6,
}

/**
 * Represents a recurring weekly availability rule for a mentor.
 * e.g. "Every Monday from 09:00 to 17:00, Africa/Lagos, 60-min slots"
 */
@Entity('mentor_availabilities')
@Index(['mentorId', 'dayOfWeek', 'isActive'])
export class MentorAvailability {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** FK to the users/mentors table */
  @Column({ type: 'uuid' })
  @Index()
  mentorId: string;

  /** 0 = Sunday … 6 = Saturday */
  @Column({ type: 'smallint' })
  dayOfWeek: DayOfWeek;

  /** Local start time in HH:mm format, e.g. "09:00" */
  @Column({ type: 'varchar', length: 5 })
  startTime: string;

  /** Local end time in HH:mm format, e.g. "17:00" */
  @Column({ type: 'varchar', length: 5 })
  endTime: string;

  /** IANA timezone identifier, e.g. "Africa/Lagos" */
  @Column({ type: 'varchar', length: 64, default: 'UTC' })
  timezone: string;

  /** Duration of each bookable slot in minutes */
  @Column({ type: 'smallint', default: 60 })
  slotDurationMinutes: number;

  /**
   * Optional gap between consecutive slots in minutes.
   * Useful for travel/preparation time between sessions.
   */
  @Column({ type: 'smallint', default: 0 })
  bufferMinutes: number;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  /** Rule only applies on or after this date (inclusive, local date) */
  @Column({ type: 'date', nullable: true })
  effectiveFrom: Date | null;

  /** Rule expires after this date (inclusive, local date). Null = no expiry */
  @Column({ type: 'date', nullable: true })
  effectiveTo: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
