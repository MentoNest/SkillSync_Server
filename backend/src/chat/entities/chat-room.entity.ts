import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';

@Entity('chat_rooms')
@Unique('uq_chat_rooms_session', ['sessionId'])
@Index('idx_chat_rooms_mentor', ['mentorAddress'])
@Index('idx_chat_rooms_mentee', ['menteeAddress'])
export class ChatRoom {
  @ApiProperty({ format: 'uuid' })
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ApiProperty({
    description: 'Mentorship session identifier (opaque string).',
  })
  @Column({ name: 'session_id', type: 'varchar', length: 128 })
  sessionId!: string;

  @ApiProperty({ description: 'Wallet address of the mentor participant.' })
  @Column({ name: 'mentor_address', type: 'varchar', length: 56 })
  mentorAddress!: string;

  @ApiProperty({ description: 'Wallet address of the mentee participant.' })
  @Column({ name: 'mentee_address', type: 'varchar', length: 56 })
  menteeAddress!: string;

  @ApiPropertyOptional({
    nullable: true,
    description: 'Timestamp of the most recent message.',
  })
  @Column({
    name: 'last_message_at',
    type: 'timestamptz',
    precision: 3,
    nullable: true,
  })
  lastMessageAt!: Date | null;

  @ApiProperty({ description: 'UTC creation timestamp.' })
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz', precision: 3 })
  createdAt!: Date;
}
