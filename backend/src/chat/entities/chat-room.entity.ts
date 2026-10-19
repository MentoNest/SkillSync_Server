import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, Unique } from 'typeorm';

/** One conversation per mentor/mentee pairing. */
@Entity('chat_rooms')
@Unique('UQ_chat_rooms_pair', ['mentorId', 'menteeId'])
@Index('IDX_chat_rooms_mentee', ['menteeId'])
export class ChatRoom {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'mentor_id', type: 'uuid' })
  mentorId!: string;

  @Column({ name: 'mentee_id', type: 'uuid' })
  menteeId!: string;

  @Column({ name: 'last_message_at', type: 'timestamptz', nullable: true })
  lastMessageAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
