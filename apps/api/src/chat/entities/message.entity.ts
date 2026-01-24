import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  Index,
} from 'typeorm';
import { Thread } from './thread.entity';
import { User } from '../../users/entities/user.entity';
import { ApiProperty } from '@nestjs/swagger';

@Entity('messages')
@Index(['thread', 'createdAt']) // For efficient message retrieval by thread
export class Message {
  @ApiProperty({
    description: 'Message ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ApiProperty({
    description: 'Thread containing this message',
    type: () => Thread,
  })
  @ManyToOne(() => Thread, (thread) => thread.messages, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  thread!: Thread;

  @ApiProperty({
    description: 'User who sent the message',
    type: () => User,
  })
  @ManyToOne(() => User, (user) => user.sentMessages, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  sender!: User;

  @ApiProperty({
    description: 'Message content',
    example: 'Hello! Looking forward to our session tomorrow.',
    maxLength: 2000,
  })
  @Column({ type: 'text' })
  body!: string;

  @ApiProperty({
    description: 'Whether the message has been read',
    example: false,
  })
  @Column({ default: false })
  isRead!: boolean;

  @ApiProperty({
    description: 'Timestamp when message was read',
    example: '2024-01-15T10:31:00.000Z',
    nullable: true,
  })
  @Column({ type: 'timestamptz', nullable: true })
  readAt!: Date;

  @ApiProperty({
    description: 'Message creation timestamp',
    example: '2024-01-15T10:30:00.000Z',
  })
  @CreateDateColumn()
  createdAt!: Date;

  @ApiProperty({
    description: 'Message last update timestamp',
    example: '2024-01-15T10:30:00.000Z',
  })
  @UpdateDateColumn()
  updatedAt!: Date;
}
