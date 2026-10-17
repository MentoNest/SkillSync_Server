import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinTable,
  ManyToMany,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { Role } from '../../rbac/entities/role.entity';
import { MenteeProfile } from './mentee-profile.entity';
import { MentorProfile } from './mentor-profile.entity';

/** Minimal account record needed for RBAC; profile fields live in the users PR. */
@Entity('users')
export class User {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 56 })
  walletAddress!: string;

  @Column({ type: 'int', default: 0 })
  tokenVersion!: number;

  @Column({ name: 'displayName', type: 'varchar', length: 100, nullable: true })
  displayName!: string | null;

  @Column({ name: 'avatarUrl', type: 'varchar', length: 2048, nullable: true })
  avatarUrl!: string | null;

  @OneToOne(() => MentorProfile, (p) => p.user)
  mentorProfile?: MentorProfile;

  @OneToOne(() => MenteeProfile, (p) => p.user)
  menteeProfile?: MenteeProfile;

  @ManyToMany(() => Role, (r) => r.users)
  @JoinTable({
    name: 'user_roles',
    joinColumn: { name: 'user_id', referencedColumnName: 'id' },
    inverseJoinColumn: { name: 'role_id', referencedColumnName: 'id' },
  })
  roles!: Role[];

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt!: Date;
}
