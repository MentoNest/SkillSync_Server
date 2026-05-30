import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  OneToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { User } from './user.entity';

@Entity({ name: 'mentor_profiles' })
export class MentorProfile {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'text', nullable: false })
  bio!: string;

  @Column('simple-array', { nullable: true })
  expertise?: string[];

  @Column({ type: 'int', nullable: false })
  yearsOfExperience!: number;

  @Column('simple-array', { nullable: true })
  preferredMentoringStyle?: string[];

  @Column({ type: 'int', nullable: true })
  availabilityHoursPerWeek?: number;

  @Column({ type: 'text', nullable: true })
  availabilityDetails?: string;

  @OneToOne(() => User, (user) => user.mentorProfile, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;
}
