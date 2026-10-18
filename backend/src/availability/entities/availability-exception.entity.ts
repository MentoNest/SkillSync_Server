import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

/**
 * A one-off override for a specific date (vacation, holiday, ...).
 * With no start/end time the whole day is blocked; otherwise only the window is blocked.
 */
@Entity('availability_exceptions')
@Index('IDX_availability_exceptions_mentor_id', ['mentorId'])
@Index('IDX_availability_exceptions_mentor_date', ['mentorId', 'date'])
export class AvailabilityException {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'mentor_id', type: 'uuid' })
  mentorId!: string;

  @Column({ type: 'date' })
  date!: string;

  @Column({ name: 'start_time', type: 'varchar', length: 5, nullable: true })
  startTime!: string | null;

  @Column({ name: 'end_time', type: 'varchar', length: 5, nullable: true })
  endTime!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reason!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
