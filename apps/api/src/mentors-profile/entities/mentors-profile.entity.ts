import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum MentorProfileStatus {
  DRAFT = 'draft',
  SUBMITTED = 'submitted',
  APPROVED = 'approved',
  REJECTED = 'rejected',
}

@Entity('mentor_profiles')
@Index(['status'])
export class MentorProfile {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @OneToOne(() => User, { nullable: false })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'user_id', unique: true })
  userId!: string;

  @Column({ type: 'varchar', length: 150 })
  headline!: string;

  @Column({
    name: 'rate_minor',
    type: 'integer',
    comment: 'Hourly rate in NGN minor units (kobo)',
  })
  rateMinor!: number;

  @Column({ name: 'years_exp', type: 'integer' })
  yearsExp!: number;

  @Column({
    type: 'enum',
    enum: MentorProfileStatus,
    default: MentorProfileStatus.DRAFT,
  })
  @Index()
  status!: MentorProfileStatus;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
