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
 * #995: Weekly recurring availability slot for a mentor.
 * Times are stored in UTC; timezone field records the mentor's local timezone
 * for display-time conversion.
 */
@Entity('availability_slots')
@Index(['mentorId'])
export class AvailabilitySlot {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** FK → users.id */
  @Column({ type: 'uuid' })
  mentorId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'mentorId' })
  mentor: User;

  /**
   * Day of week: 0 = Sunday … 6 = Saturday (ISO-compatible when 1=Mon,
   * but keeping 0-based for flexibility per the issue spec).
   */
  @Column({ type: 'smallint' })
  dayOfWeek: number; // 0–6

  /** UTC start time stored as "HH:MM" (24-hour). */
  @Column({ type: 'varchar', length: 5 })
  startTime: string;

  /** UTC end time stored as "HH:MM" (24-hour). */
  @Column({ type: 'varchar', length: 5 })
  endTime: string;

  /** IANA timezone string the mentor used when defining this slot. */
  @Column({ type: 'varchar', length: 64, default: 'UTC' })
  timezone: string;

  @Column({ type: 'boolean', default: true })
  isActive: boolean;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
