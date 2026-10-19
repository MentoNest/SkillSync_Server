import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';
import type { ChatAttachment } from '../chat.types';

@Entity('chat_messages')
@Index('IDX_chat_messages_room_created', ['roomId', 'createdAt'])
@Index('IDX_chat_messages_room_unread', ['roomId', 'senderId', 'readAt'])
export class ChatMessage {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'room_id', type: 'uuid' })
  roomId!: string;

  @Column({ name: 'sender_id', type: 'uuid' })
  senderId!: string;

  @Column({ type: 'text', default: '' })
  body!: string;

  @Column({ type: 'jsonb', default: () => "'[]'" })
  attachments!: ChatAttachment[];

  /** Read receipt: when the other participant read it (null = unread). */
  @Column({ name: 'read_at', type: 'timestamptz', nullable: true })
  readAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
