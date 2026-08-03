import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { SessionStatus } from './enums/session-status.enum.js';

// Milestone entity for JSON storage
export class Milestone {
  description: string;
  percentage: number;
  released: boolean;
  completedAt?: Date;
}

// Rating entity for JSON storage
export class SessionRating {
  buyerRating?: number;
  sellerRating?: number;
  buyerComment?: string;
  sellerComment?: string;
}

@Entity('mentorship_sessions')
export class Session {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  @Index()
  mentorId!: string; // Seller

  @Column()
  @Index()
  menteeId!: string; // Buyer

  @Column({ type: 'varchar', nullable: true })
  @Index()
  blockchainSessionId!: string | null; // On-chain session ID

  @Column({ type: 'timestamp' })
  startTime!: Date;

  @Column({ type: 'timestamp' })
  endTime!: Date;

  @Column({ type: 'timestamp', nullable: true })
  deadline!: Date | null;

  @Column({ type: 'timestamp', nullable: true })
  startedAt!: Date | null;

  @Column({ type: 'enum', enum: SessionStatus, default: SessionStatus.PENDING })
  @Index()
  status!: SessionStatus;

  @Column({ type: 'varchar', nullable: true })
  meetingUrl!: string | null;

  @Column({ type: 'text', nullable: true })
  notes!: string | null;

  @Column({ type: 'int', nullable: true })
  amount!: number;

  @Column({ type: 'varchar', nullable: true })
  tokenAddress!: string | null;

  // Store milestones as JSON
  @Column({ type: 'jsonb', nullable: true })
  milestones!: Milestone[] | null;

  // Store ratings as JSON
  @Column({ type: 'jsonb', nullable: true })
  rating!: SessionRating | null;

  @Column({ type: 'text', nullable: true })
  review!: string | null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}