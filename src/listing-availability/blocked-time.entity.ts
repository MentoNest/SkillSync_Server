import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

/**
 * A one-off time block that marks a mentor as unavailable,
 * overriding any recurring availability rule.
 * Examples: vacations, sick days, personal appointments.
 */
@Entity('mentor_blocked_times')
@Index(['mentorId', 'startAt', 'endAt'])
export class BlockedTime {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** FK to the users/mentors table */
  @Column({ type: 'uuid' })
  @Index()
  mentorId: string;

  /** UTC timestamp when the blocked period starts */
  @Column({ type: 'timestamptz' })
  startAt: Date;

  /** UTC timestamp when the blocked period ends */
  @Column({ type: 'timestamptz' })
  endAt: Date;

  /** Optional human-readable reason (e.g. "Annual leave") */
  @Column({ type: 'varchar', length: 255, nullable: true })
  reason: string | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
