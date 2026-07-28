import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { SessionStatus } from './enums/session-status.enum.js';

@Entity('mentorship_sessions')
export class Session {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  @Index()
  mentorId!: string;

  @Column()
  @Index()
  menteeId!: string;

  @Column({ type: 'timestamp' })
  startTime!: Date;

  @Column({ type: 'timestamp' })
  endTime!: Date;

  @Column({ type: 'enum', enum: SessionStatus, default: SessionStatus.PENDING })
  @Index()
  status!: SessionStatus;

  @Column({ type: 'varchar', nullable: true })
  meetingUrl!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'int', nullable: true })
  rating!: number | null;

  @Column({ type: 'text', nullable: true })
  review!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
