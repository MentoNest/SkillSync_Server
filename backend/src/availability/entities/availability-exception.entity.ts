import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { randomUUID } from 'crypto';
import { User } from '../../users/entities/user.entity';

@Entity({ name: 'availability_exceptions' })
@Index('IDX_availability_exceptions_mentor_id', ['mentorId'])
export class AvailabilityException {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'mentor_id', type: 'uuid' })
  mentorId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  mentor!: User;

  /** YYYY-MM-DD */
  @Column({ name: 'exception_date', type: 'date' })
  exceptionDate!: string;

  /** HH:MM in UTC, null = full day unavailable */
  @Column({ name: 'start_time', type: 'varchar', length: '5', nullable: true })
  startTime!: string | null;

  @Column({ name: 'end_time', type: 'varchar', length: '5', nullable: true })
  endTime!: string | null;

  @Column({ type: 'varchar', length: '256', nullable: true })
  reason!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @BeforeInsert()
  setId(): void {
    this.id ??= randomUUID();
  }
}
