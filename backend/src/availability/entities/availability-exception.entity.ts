import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity.js';

/**
 * #995: One-off exception to a mentor's weekly availability schedule.
 * An exception can mark a specific date/time range as unavailable (holiday,
 * vacation, etc.) or as an extra available window.
 */
@Entity('availability_exceptions')
@Index(['mentorId'])
@Index(['exceptionDate'])
export class AvailabilityException {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  mentorId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'mentorId' })
  mentor: User;

  /** The calendar date this exception applies to (UTC date, stored as DATE). */
  @Column({ type: 'date' })
  exceptionDate: string; // "YYYY-MM-DD"

  /**
   * Optional UTC start time ("HH:MM"). When null the exception covers the
   * entire day.
   */
  @Column({ type: 'varchar', length: 5, nullable: true })
  startTime: string | null;

  /** Optional UTC end time ("HH:MM"). */
  @Column({ type: 'varchar', length: 5, nullable: true })
  endTime: string | null;

  /**
   * Human-readable reason shown to the mentor (internal only).
   * Examples: "Holiday", "Vacation", "Doctor appointment".
   */
  @Column({ type: 'text', nullable: true })
  reason: string | null;

  /**
   * true  → mentor IS available during this window (extra slot).
   * false → mentor is NOT available (blocks a normally-open slot).
   */
  @Column({ type: 'boolean', default: false })
  isAvailable: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
