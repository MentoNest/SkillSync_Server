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
import { User } from '../../auth/entities/user.entity';

@Entity('mentor_profiles')
@Index(['isFeatured', 'featuredOrder'])
@Index(['isFeatured', 'featuredAt'])
export class MentorProfile {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ nullable: true })
  bio: string;

  @Column({ type: 'int', nullable: true })
  yearsOfExperience: number;

  @Column('simple-array', { nullable: true })
  expertise: string[];

  @Column('simple-array', { nullable: true })
  preferredMentoringStyle: string[];

  @Column({ type: 'int', nullable: true })
  availabilityHoursPerWeek: number;

  @Column({ nullable: true })
  availabilityDetails: string;

  @Column({ default: false })
  isFeatured: boolean;

  @Column({ type: 'timestamp', nullable: true })
  featuredAt: Date;

  @Column({ type: 'timestamp', nullable: true })
  featuredExpiresAt: Date;

  @Column({ type: 'int', default: 0 })
  featuredOrder: number;

  @OneToOne(() => User, (user) => user.mentorProfile)
  @JoinColumn()
  user: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}