import { Entity, PrimaryColumn, Column, CreateDateColumn, ManyToOne, JoinColumn, Index } from 'typeorm';
import { MentorshipSession } from './mentorship-session.entity';

@Entity({ name: 'chat_messages' })
export class ChatMessage {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'session_id', type: 'uuid' })
  sessionId!: string;

  @ManyToOne(() => MentorshipSession, (session) => session.messages, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'session_id' })
  session!: MentorshipSession;

  @Column({ name: 'sender_id', type: 'uuid' })
  senderId!: string;

  @Column({ name: 'content', type: 'text' })
  content!: string;

  @Column({ name: 'file_url', type: 'varchar', length: 512, nullable: true })
  fileUrl!: string | null;

  @Column({ name: 'file_name', type: 'varchar', length: 256, nullable: true })
  fileName!: string | null;

  @Column({ name: 'file_type', type: 'varchar', length: 128, nullable: true })
  fileType!: string | null;

  @Column({ name: 'read_by', type: 'uuid', array: true, default: [] })
  readBy!: string[];

  @Index({ name: 'IDX_chat_messages_session_created' })
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;
}