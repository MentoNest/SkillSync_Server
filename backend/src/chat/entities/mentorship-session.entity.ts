import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  Index,
} from 'typeorm';
import { ChatRoom } from './chat-room.entity';

export enum SessionStatus {
  ACTIVE = 'active',
  COMPLETED = 'completed',
  CANCELLED = 'cancelled',
}

@Entity('mentorship_sessions')
@Index(['mentorId', 'menteeId'])
export class MentorshipSession {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'mentor_id' })
  @Index()
  mentorId: string;

  @Column({ name: 'mentee_id' })
  @Index()
  menteeId: string;

  @Column({ type: 'varchar', length: 20, default: SessionStatus.ACTIVE })
  status: SessionStatus;

  @Column({ name: 'contract_session_id', nullable: true, type: 'varchar', length: 256 })
  contractSessionId: string | null;

  @OneToOne(() => ChatRoom, (room) => room.session, { cascade: true, eager: false })
  chatRoom: ChatRoom;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
