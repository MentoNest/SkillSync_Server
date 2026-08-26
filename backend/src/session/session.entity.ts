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
import { User } from '../user/entities/user.entity';

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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
