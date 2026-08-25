import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  DeleteDateColumn,
  ManyToMany,
  OneToOne,
  JoinTable,
  Index,
} from 'typeorm';
import {
  IsUUID,
  IsString,
  IsEmail,
  IsOptional,
  IsEnum,
  IsUrl,
  IsInt,
  IsDate,
  IsNotEmpty,
} from 'class-validator';
import { Role } from './role.entity';
import { MentorProfile } from './mentor-profile.entity';
import { MenteeProfile } from './mentee-profile.entity';

export enum UserStatus {
  ACTIVE = 'active',
  PENDING = 'pending',
  SUSPENDED = 'suspended',
  DELETED = 'deleted',
}

@Entity('users')
@Index('IDX_users_walletAddress', ['walletAddress'])
@Index('IDX_users_status', ['status'])
@Index('IDX_users_createdAt', ['createdAt'])
@Index('IDX_users_lastLoginAt', ['lastLoginAt'])
export class User {
  @PrimaryGeneratedColumn('uuid')
  @IsUUID()
  @IsOptional()
  id: string;

  @Column({ unique: true })
  @Index({ unique: true })
  @IsString()
  @IsNotEmpty()
  walletAddress: string;

  @Column({ unique: true, nullable: true })
  @IsEmail()
  @IsOptional()
  email?: string | null;

  @Column({ nullable: true })
  @IsString()
  @IsOptional()
  displayName?: string | null;

  @Column({ nullable: true })
  @IsString()
  @IsOptional()
  passwordHash?: string | null;

  @Column({ default: 0 })
  @IsInt()
  @IsOptional()
  tokenVersion: number;

  @Column({
    type: 'enum',
    enum: UserStatus,
    default: UserStatus.PENDING,
  })
  @IsEnum(UserStatus)
  @IsOptional()
  status: UserStatus;

  @Column({ nullable: true })
  @IsUrl()
  @IsOptional()
  avatarUrl?: string | null;

  @Column({ nullable: true })
  @IsString()
  @IsOptional()
  timezone?: string | null;

  @Column({ nullable: true })
  @IsString()
  @IsOptional()
  locale?: string | null;

  @CreateDateColumn()
  @IsDate()
  @IsOptional()
  createdAt: Date;

  @UpdateDateColumn()
  @IsDate()
  @IsOptional()
  updatedAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  @IsDate()
  @IsOptional()
  lastLoginAt?: Date | null;

  @DeleteDateColumn()
  @IsDate()
  @IsOptional()
  deletedAt?: Date | null;

  @ManyToMany(() => Role, role => role.users, { cascade: true })
  @JoinTable({ name: 'user_roles' })
  roles: Role[];

  @OneToOne(() => MentorProfile, mentorProfile => mentorProfile.user, {
    cascade: true,
  })
  mentorProfile?: MentorProfile;

  @OneToOne(() => MenteeProfile, menteeProfile => menteeProfile.user, {
    cascade: true,
  })
  menteeProfile?: MenteeProfile;
}