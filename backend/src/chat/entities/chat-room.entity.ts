import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { MentorshipSession } from './mentorship-session.entity';
import { Message } from './message.entity';

@Entity('chat_rooms')
export class ChatRoom {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'session_id', unique: true })
  sessionId: string;

  @OneToOne(() => MentorshipSession, (session) => session.chatRoom, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session: MentorshipSession;

  @OneToMany(() => Message, (msg) => msg.room)
  messages: Message[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
