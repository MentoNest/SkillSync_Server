import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { randomUUID } from 'crypto';
import { User } from '../../users/entities/user.entity';

@Entity({ name: 'availability_slots' })
@Index('IDX_availability_slots_mentor_id', ['mentorId'])
export class AvailabilitySlot {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'mentor_id', type: 'uuid' })
  mentorId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  mentor!: User;

  /** 0 = Sunday, 6 = Saturday */
  @Column({ name: 'day_of_week', type: 'smallint' })
  dayOfWeek!: number;

  /** HH:MM in UTC */
  @Column({ name: 'start_time', type: 'varchar', length: '5' })
  startTime!: string;

  /** HH:MM in UTC */
  @Column({ name: 'end_time', type: 'varchar', length: '5' })
  endTime!: string;

  @Column({ type: 'varchar', length: '64', default: 'UTC' })
  timezone!: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @BeforeInsert()
  setId(): void {
    this.id ??= randomUUID();
  }
}
