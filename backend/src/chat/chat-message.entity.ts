import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../user/entities/user.entity';

@Entity('chat_messages')
@Index('IDX_chat_messages_sender', ['senderId'])
@Index('IDX_chat_messages_receiver', ['receiverId'])
export class ChatMessage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  senderId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'senderId' })
  sender: User;

  @Column({ type: 'uuid' })
  receiverId: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'receiverId' })
  receiver: User;

  @Column({ type: 'uuid', nullable: true })
  sessionId: string | null;

  @Column({ type: 'text' })
  content: string;

  @Column({ type: 'boolean', default: false })
  isRead: boolean;

  @Column({ type: 'varchar', length: 500, nullable: true })
  fileUrl: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  fileType: string | null;

  @CreateDateColumn()
  createdAt: Date;
}
