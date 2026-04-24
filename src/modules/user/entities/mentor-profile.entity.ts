import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
} from 'typeorm';
import { User } from '../../auth/entities/user.entity';

@Entity('mentor_profiles')
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

  @OneToOne(() => User, (user) => user.mentorProfile)
  @JoinColumn()
  user: User;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}