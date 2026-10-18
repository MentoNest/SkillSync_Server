import { Check, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/** A weekly recurring availability window for a mentor. Times are wall-clock in `timezone`. */
@Entity('availability_slots')
@Index('IDX_availability_slots_mentor_id', ['mentorId'])
// Availability lookup: "every slot for this mentor on this weekday" (#1463).
@Index('IDX_availability_slots_mentor_day', ['mentorId', 'dayOfWeek'])
@Check('CHK_availability_slots_day_of_week', '"day_of_week" >= 0 AND "day_of_week" <= 6')
export class AvailabilitySlot {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'mentor_id', type: 'uuid' })
  mentorId!: string;

  /** 0 = Sunday ... 6 = Saturday (matches JS `Date.getDay()`). */
  @Column({ name: 'day_of_week', type: 'int' })
  dayOfWeek!: number;

  @Column({ name: 'start_time', type: 'varchar', length: 5 })
  startTime!: string;

  @Column({ name: 'end_time', type: 'varchar', length: 5 })
  endTime!: string;

  @Column({ type: 'varchar', length: 64, default: 'UTC' })
  timezone!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
