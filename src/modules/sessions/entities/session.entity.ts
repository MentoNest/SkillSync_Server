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
import { User } from '../../auth/entities/user.entity';

export enum SessionStatus {
  PENDING = 'pending',
  CONFIRMED = 'confirmed',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
  NO_SHOW = 'no_show',
}

@Entity('sessions')
@Index(['mentorId'])
@Index(['menteeId'])
@Index(['status'])
@Index(['startTime', 'endTime'])
@Index(['mentorId', 'startTime', 'endTime'])
export class Session {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  mentorId: string;

  @Column()
  @Index()
  menteeId: string;

  @Column({ type: 'timestamp' })
  @Index()
  startTime: Date;

  @Column({ type: 'timestamp' })
  @Index()
  endTime: Date;

  @Column({
    type: 'enum',
    enum: SessionStatus,
    default: SessionStatus.PENDING,
  })
  status: SessionStatus;

  @Column({ nullable: true })
  meetingUrl: string;

  @Column({ type: 'text', nullable: true })
  notes: string;

  @Column({ type: 'int', nullable: true })
  rating: number; // 1-5 rating

  @Column({ type: 'text', nullable: true })
  review: string;

  @Column({ type: 'timestamp', nullable: true })
  cancelledAt: Date;

  @Column({ nullable: true })
  cancellationReason: string;

  @ManyToOne(() => User, { eager: false })
  @JoinColumn({ name: 'mentorId' })
  mentor: User;

  @ManyToOne(() => User, { eager: false })
  @JoinColumn({ name: 'menteeId' })
  mentee: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
