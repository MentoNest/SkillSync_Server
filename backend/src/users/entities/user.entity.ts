import {
  BeforeInsert,
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinTable,
  ManyToMany,
  OneToOne,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';
import { randomUUID } from 'crypto';
import { Role } from './role.entity';
import { MentorProfile } from './mentor-profile.entity';
import { MenteeProfile } from './mentee-profile.entity';

@Entity({ name: 'users' })
export class User {
  @PrimaryColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ name: 'wallet_address', type: 'varchar', length: 128 })
  walletAddress!: string;

  @Column({ name: 'token_version', type: 'int', default: 0 })
  tokenVersion!: number;

  @Column({ name: 'display_name', type: 'varchar', length: 255, nullable: true })
  displayName?: string;

  @Column({ name: 'avatar_url', type: 'text', nullable: true })
  avatarUrl?: string;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @ManyToMany(() => Role, (role) => role.users, { eager: true })
  @JoinTable({
    name: 'user_roles',
    joinColumn: { name: 'user_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'role_id', referencedColumnName: 'id' },
  })
  roles!: Role[];

  @OneToOne(() => MentorProfile, (mentorProfile) => mentorProfile.user)
  mentorProfile?: MentorProfile;

  @OneToOne(() => MenteeProfile, (menteeProfile) => menteeProfile.user)
  menteeProfile?: MenteeProfile;

  @BeforeInsert()
  setId(): void {
    this.id ??= randomUUID();
  }
}
