import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  Unique,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';
import { Message } from './message.entity';
import { ApiProperty } from '@nestjs/swagger';

@Entity('threads')
@Unique(['mentor', 'mentee']) // Prevent duplicate threads per mentor-mentee pair
export class Thread {
  @ApiProperty({
    description: 'Thread ID',
    example: '123e4567-e89b-12d3-a456-426614174000',
  })
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ApiProperty({
    description: 'Mentor participating in the thread',
    type: () => User,
  })
  @ManyToOne(() => User, (user) => user.mentorThreads, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  mentor!: User;

  @ApiProperty({
    description: 'Mentee participating in the thread',
    type: () => User,
  })
  @ManyToOne(() => User, (user) => user.menteeThreads, {
    onDelete: 'CASCADE',
    nullable: false,
  })
  mentee!: User;

  @ApiProperty({
    description: 'Messages in the thread',
    type: () => [Message],
    isArray: true,
  })
  @OneToMany(() => Message, (message) => message.thread, {
    cascade: true,
  })
  messages!: Message[];

  @ApiProperty({
    description: 'Last message content for preview',
    example: 'Looking forward to our session tomorrow!',
    nullable: true,
  })
  @Column({ type: 'text', nullable: true })
  lastMessagePreview!: string;

  @ApiProperty({
    description: 'Timestamp of the last message',
    example: '2024-01-15T10:30:00.000Z',
    nullable: true,
  })
  @Column({ type: 'timestamptz', nullable: true })
  lastMessageAt!: Date;

  @ApiProperty({
    description: 'Whether the thread is archived',
    example: false,
  })
  @Column({ default: false })
  isArchived!: boolean;

  @ApiProperty({
    description: 'Thread creation timestamp',
    example: '2024-01-01T00:00:00.000Z',
  })
  @CreateDateColumn()
  createdAt!: Date;

  @ApiProperty({
    description: 'Thread last update timestamp',
    example: '2024-01-01T00:00:00.000Z',
  })
  @UpdateDateColumn()
  updatedAt!: Date;

  // Helper method to check if user is participant
  isParticipant(userId: string): boolean {
    return this.mentor.id === userId || this.mentee.id === userId;
  }

  // Helper method to get other participant
  getOtherParticipant(userId: string): User {
    if (this.mentor.id === userId) {
      return this.mentee;
    }
    if (this.mentee.id === userId) {
      return this.mentor;
    }
    throw new Error('User is not a participant in this thread');
  }
}
