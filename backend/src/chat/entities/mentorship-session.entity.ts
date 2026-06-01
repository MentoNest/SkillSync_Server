import { Entity, PrimaryColumn, Column, CreateDateColumn, UpdateDateColumn, Index, ManyToOne, JoinColumn, OneToMany } from 'typeorm';
import { randomUUID } from 'crypto';
import { User } from '../../users/entities/user.entity';
import { ChatMessage } from './chat-message.entity';

@Entity({ name: 'mentorship_sessions' })
export class MentorshipSession {
  @PrimaryColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ name: 'mentor_id', type: 'uuid' })
  mentorId!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'mentor_id' })
  mentor!: User;

  @Index({ unique: true })
  @Column({ name: 'mentee_id', type: 'uuid' })
  menteeId!: string;

  @ManyToOne(() => User)
  @JoinColumn({ name: 'mentee_id' })
  mentee!: User;

  @Column({ name: 'status', type: 'varchar', length: 32, default: 'active' })
  status!: 'active' | 'ended' | 'cancelled';

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @Column({ name: 'ended_at', type: 'timestamptz', nullable: true })
  endedAt!: Date | null;

  @OneToMany(() => ChatMessage, (message) => message.session)
  messages!: ChatMessage[];
}