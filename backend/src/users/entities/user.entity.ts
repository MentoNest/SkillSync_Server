import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { UserStatus } from '../enums/user-status.enum.js';
import { Role } from './role.entity.js';
import { MentorProfile } from './mentor-profile.entity.js';
import { MenteeProfile } from './mentee-profile.entity.js';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 256 })
  walletAddress: string;

  @Column({ type: 'varchar', nullable: true })
  username: string;

  @Column({ type: 'varchar', length: 255, nullable: true, unique: true })
  email: string;

  @Column({ type: 'varchar', nullable: true })
  displayName: string;

  @Column({
    type: 'enum',
    enum: UserStatus,
    default: UserStatus.ACTIVE,
  })
  status: UserStatus;

  @Column({ default: 0 })
  tokenVersion: number;

  @Column({ type: 'varchar', nullable: true })
  avatarUrl: string | null;

  @Column({ type: 'varchar', nullable: true })
  avatarThumbnailUrl: string | null;

  @Column({ type: 'varchar', nullable: true })
  avatarStorageKey: string | null;

  @OneToMany(() => Role, (role) => role.user, { cascade: true, eager: true })
  roles: Role[];

  @OneToOne(() => MentorProfile, (profile) => profile.user)
  mentorProfile: MentorProfile;

  @OneToOne(() => MenteeProfile, (profile) => profile.user)
  menteeProfile: MenteeProfile;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
