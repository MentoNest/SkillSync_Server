import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';

import { Thread } from '../../chat/entities/thread.entity';
import { Message } from '../../chat/entities/message.entity';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  email!: string;

  @Column()
  firstName!: string;

  @Column()
  lastName!: string;

  @Column({ nullable: true, length: 500 })
  avatarUrl?: string;

  @Column({ nullable: true })
  password_hash?: string;

  @Column({ default: true })
  isActive!: boolean;

  @Column({ nullable: true })
  emailVerifiedAt?: Date;

  @OneToMany(() => Thread, (thread) => thread.mentor)
  mentorThreads: Thread[] = [];

  @OneToMany(() => Thread, (thread) => thread.mentee)
  menteeThreads: Thread[] = [];

  @OneToMany(() => Message, (message) => message.sender)
  sentMessages: Message[] = [];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
