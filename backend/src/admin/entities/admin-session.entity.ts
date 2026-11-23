import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';

export enum AdminSessionStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  NO_SHOW = 'no_show',
}

@Entity('sessions')
export class AdminSession {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'mentor_id', type: 'varchar', length: 56 })
  mentorId!: string;

  @Column({ name: 'mentee_id', type: 'varchar', length: 56 })
  menteeId!: string;

  @Column({ name: 'start_time', type: 'timestamptz' })
  startTime!: Date;

  @Column({ name: 'end_time', type: 'timestamptz' })
  endTime!: Date;

  @Column({
    type: 'enum',
    enum: AdminSessionStatus,
    enumName: 'sessions_status_enum',
  })
  status!: AdminSessionStatus;

  @Column({
    name: 'meeting_url',
    type: 'varchar',
    length: 2048,
    nullable: true,
  })
  meetingUrl!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({
    name: 'cancellation_reason',
    type: 'varchar',
    length: 500,
    nullable: true,
  })
  cancellationReason!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
