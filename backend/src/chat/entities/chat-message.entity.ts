import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import type { ChatAttachment } from '../chat.types';

@Entity('chat_messages')
@Index('idx_chat_messages_room_created', ['roomId', 'createdAt'])
@Index('idx_chat_messages_room_unread', ['roomId', 'senderId', 'readAt'])
export class ChatMessage {
  @ApiProperty({ format: 'uuid' })
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ApiProperty({ format: 'uuid', description: 'Chat room UUID.' })
  @Column({ name: 'room_id', type: 'uuid' })
  roomId!: string;

  @ApiProperty({ description: 'Wallet address of the sender.' })
  @Column({ name: 'sender_id', type: 'varchar', length: 56 })
  senderId!: string;

  @ApiProperty({
    description: 'Message text (may be empty when attachments are present).',
  })
  @Column({ type: 'text', default: '' })
  body!: string;

  @ApiProperty({
    type: 'array',
    items: { type: 'object' },
    description: 'JSONB attachment metadata.',
  })
  @Column({ type: 'jsonb', default: () => "'[]'" })
  attachments!: ChatAttachment[];

  @ApiPropertyOptional({
    nullable: true,
    description: 'When the other participant read this message.',
  })
  @Column({
    name: 'read_at',
    type: 'timestamptz',
    precision: 3,
    nullable: true,
  })
  readAt!: Date | null;

  @ApiProperty({ description: 'UTC creation timestamp.' })
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 3 })
  createdAt!: Date;
}
