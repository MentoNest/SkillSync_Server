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
} from 'typeorm';
import { IsEmail, IsEnum, IsOptional, IsString, IsUrl, Length } from 'class-validator';
import { IsStellarAddress } from '../../../common/validators/stellar-address.validator';
import { Role } from './role.entity';
import { MentorProfile } from '../../user/entities/mentor-profile.entity';
import { MenteeProfile } from '../../user/entities/mentee-profile.entity';

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
@Index('IDX_USERS_STATUS', ['status'])
@Index('IDX_USERS_CREATED_AT', ['createdAt'])
@Index('IDX_USERS_LAST_LOGIN_AT', ['lastLoginAt'])
export class User {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @IsStellarAddress()
  @IsString()
  @Length(56, 56)
  @Index('IDX_USERS_WALLET_ADDRESS')
  @Column({ unique: true })
  walletAddress: string;

  @IsOptional()
  @IsEmail()
  @Index('IDX_USERS_EMAIL')
  @Column({ unique: true, nullable: true })
  email: string;

  @IsOptional()
  @IsString()
  @Length(1, 255)
  @Column({ nullable: true })
  displayName: string;

  @IsEnum(UserStatus)
  @Column({ type: 'enum', enum: UserStatus, default: UserStatus.PENDING })
  status: UserStatus;

  @IsOptional()
  @IsUrl()
  @Column({ nullable: true })
  avatarUrl: string;

  @IsOptional()
  @IsString()
  @Column({ nullable: true })
  timezone: string;

  @IsOptional()
  @IsString()
  @Column({ nullable: true })
  locale: string;

  @IsOptional()
  @IsString()
  @Column({ nullable: true })
  nonce: string;

  @Column({ default: 1 })
  tokenVersion: number;

  @IsOptional()
  @Column({ type: 'timestamp', nullable: true })
  lastLoginAt: Date;

  @IsOptional()
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

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @DeleteDateColumn()
  deletedAt: Date;
}
