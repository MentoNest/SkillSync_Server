import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
} from 'typeorm';
import { UserRole, UserStatus } from '@libs/common';

import { Thread } from '../../chat/entities/thread.entity';
import { Message } from '../../chat/entities/message.entity';

@Entity('users')
@Index(['email'])
@Index(['status'])
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true, type: 'varchar' })
  email!: string;

  @Column({ nullable: true })
  firstName?: string;

  @Column({ nullable: true })
  lastName?: string;

  @Column({ nullable: true, length: 500 })
  avatarUrl?: string;

  @Column()
  password_hash!: string;

  @Column('enum', {
    enum: UserRole,
    array: true,
    default: [UserRole.MENTEE],
  })
  roles: UserRole[] = [UserRole.MENTEE];

  @Column('enum', {
    enum: UserStatus,
    default: UserStatus.PENDING,
  })
  status: UserStatus = UserStatus.PENDING;

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
