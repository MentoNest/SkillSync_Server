import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToMany,
  JoinTable,
  Index,
  OneToOne,
  OneToMany,
} from 'typeorm';
import { Role } from './role.entity';
import { MentorProfile } from '../../user/entities/mentor-profile.entity';
import { MenteeProfile } from '../../user/entities/mentee-profile.entity';
import { Session } from '../../sessions/entities/session.entity';

export enum UserRole {
  USER = 'user',
  MODERATOR = 'moderator',
  ADMIN = 'admin',
  MENTOR = 'mentor',
  MENTEE = 'mentee',
}

export enum UserStatus {
  ACTIVE = 'active',
  PENDING = 'pending',
  SUSPENDED = 'suspended',
  DELETED = 'deleted',
}

@Entity('users')
@Index(['status'])
@Index(['createdAt'])
@Index(['lastLoginAt'])
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ unique: true })
  walletAddress: string;

  @Index({ unique: true })
  @Column({ unique: true, nullable: true })
  email: string;

  @Column({ nullable: true })
  displayName: string;

  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.PENDING })
  status: UserStatus;

  @Column({ nullable: true })
  avatarUrl: string;

  @Column({ nullable: true })
  timezone: string;

  @Column({ nullable: true })
  locale: string;

  @Column({ nullable: true })
  nonce: string;

  @Column({ default: 1 })
  tokenVersion: number;

  @Column({ type: 'timestamp', nullable: true })
  lastLoginAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  gracePeriodEndsAt: Date;

  @ManyToMany(() => Role, (role) => role.users, { cascade: true })
  @JoinTable({
    name: 'user_roles',
    joinColumn: { name: 'userId', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'roleId', referencedColumnName: 'id' },
  })
  roles: Role[];

  @OneToOne(() => MentorProfile, (mentorProfile) => mentorProfile.user, { nullable: true, cascade: true })
  mentorProfile: MentorProfile;

  @OneToOne(() => MenteeProfile, (menteeProfile) => menteeProfile.user, { nullable: true, cascade: true })
  menteeProfile: MenteeProfile;

  @OneToMany(() => Session, (session) => session.mentor)
  mentorSessions: Session[];

  @OneToMany(() => Session, (session) => session.mentee)
  menteeSessions: Session[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date;
}
