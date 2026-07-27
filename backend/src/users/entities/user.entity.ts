import {
  Column,
  CreateDateColumn,
  DeleteDateColumn,
  Entity,
  Index,
  OneToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { IsEmail, IsOptional, IsString, MaxLength } from 'class-validator';
import { UserStatus } from '../enums/user-status.enum.js';
import { Role } from './role.entity.js';
import { MentorProfile } from './mentor-profile.entity.js';
import { MenteeProfile } from './mentee-profile.entity.js';

@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 256 })
  @IsString()
  walletAddress: string;

  @Index({ unique: true, where: '"email" IS NOT NULL' })
  @Column({ type: 'varchar', length: 255, nullable: true })
  @IsOptional()
  @IsEmail()
  email: string | null;

  @Column({ type: 'varchar', nullable: true })
  username: string;

  @Column({ type: 'varchar', nullable: true })
  displayName: string;

  @Column({ type: 'varchar', length: 2048, nullable: true })
  avatarUrl: string | null;

  @Index()
  @Column({
    type: 'enum',
    enum: UserStatus,
    default: UserStatus.ACTIVE,
  })
  status: UserStatus;

  @Column({ default: 0 })
  tokenVersion: number;

  @Column({ type: 'varchar', length: 64, default: 'UTC' })
  timezone: string;

  @Column({ type: 'varchar', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(16)
  locale: string | null;

  @Index()
  @Column({ type: 'timestamp', nullable: true })
  lastLoginAt: Date | null;

  @OneToMany(() => Role, (role) => role.user, { cascade: true, eager: true })
  roles: Role[];

  @OneToOne(() => MentorProfile, (profile) => profile.user)
  mentorProfile: MentorProfile;

  @OneToOne(() => MenteeProfile, (profile) => profile.user)
  menteeProfile: MenteeProfile;

  @Index()
  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date | null;
}
