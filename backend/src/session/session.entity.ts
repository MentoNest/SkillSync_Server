import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../user/entities/user.entity.js';

export enum SessionStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  NO_SHOW = 'no_show',
}

@Entity('sessions')
@Index('IDX_sessions_mentor', ['mentorId'])
@Index('IDX_sessions_mentee', ['menteeId'])
@Index('IDX_sessions_status', ['status'])
@Index('IDX_sessions_startTime', ['startTime'])
export class Session {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  mentorId: string;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'mentorId' })
  mentor: User;

  @Column({ type: 'uuid' })
  menteeId: string;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'menteeId' })
  mentee: User;

  @Column({ type: 'timestamp' })
  startTime: Date;

  @Column({ type: 'timestamp' })
  endTime: Date;

  @Column({
    type: 'enum',
    enum: SessionStatus,
    default: SessionStatus.PENDING,
  })
  status: SessionStatus;

  @Column({ type: 'varchar', length: 500, nullable: true })
  meetingUrl: string | null;

  @Column({ type: 'text', nullable: true })
  notes: string | null;

  @Column({ type: 'int', nullable: true })
  rating: number | null;

  @Column({ type: 'text', nullable: true })
  review: string | null;

  // #1363: lifecycle timestamps for the status workflow.
  @Column({ type: 'timestamp', nullable: true })
  confirmedAt: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  completedAt: Date | null;

  // #1363: cancellation audit — who cancelled, why, and whether the 24-hour
  // policy was violated (penalty left to the payments/escrow integration).
  @Column({ type: 'uuid', nullable: true })
  cancelledBy: string | null;

  @Column({ type: 'text', nullable: true })
  cancellationReason: string | null;

  @Column({ type: 'boolean', default: false })
  cancellationPenaltyApplied: boolean;

  // #1363: set once the reminder placeholder has fired for this session.
  @Column({ type: 'timestamp', nullable: true })
  reminderSentAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
