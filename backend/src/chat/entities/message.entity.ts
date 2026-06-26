import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { ChatRoom } from './chat-room.entity';
import { MessageAttachment } from './message-attachment.entity';

export enum MessageType {
  TEXT = 'text',
  FILE = 'file',
  SYSTEM = 'system',
}

@Entity('messages')
@Index(['roomId', 'createdAt'])
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'room_id' })
  @Index()
  roomId: string;

  @Column({ name: 'sender_id' })
  @Index()
  senderId: string;

  @Column({ type: 'text', nullable: true })
  content: string | null;

  @Column({ name: 'message_type', type: 'varchar', length: 20, default: MessageType.TEXT })
  messageType: MessageType;

  @Column({ name: 'is_read', default: false })
  isRead: boolean;

  @Column({ name: 'read_at', nullable: true, type: 'timestamptz' })
  readAt: Date | null;

  @ManyToOne(() => ChatRoom, (room) => room.messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'room_id' })
  room: ChatRoom;

  @OneToMany(() => MessageAttachment, (att) => att.message, { cascade: true, eager: true })
  attachments: MessageAttachment[];

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt: Date;
}
