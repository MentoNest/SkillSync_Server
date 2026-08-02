import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { MessageType } from './enums/message-type.enum.js';

@Entity('messages')
export class Message {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column()
  @Index()
  sessionId!: string;

  @Column()
  @Index()
  senderId!: string;

  @Column({ type: 'text' })
  content!: string;

  @Column({ type: 'enum', enum: MessageType, default: MessageType.TEXT })
  type!: MessageType;

  @Column({ type: 'jsonb', default: [] })
  readBy!: string[];

  @CreateDateColumn()
  createdAt!: Date;
}
