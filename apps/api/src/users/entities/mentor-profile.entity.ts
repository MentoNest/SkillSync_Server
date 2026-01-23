import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
  OneToMany,
} from 'typeorm';
import { User } from './user.entity';
import { MentorSkill } from '../entities/mentor-skill.entity';

@Entity('mentor_profiles')
export class MentorProfile {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @OneToOne(() => User)
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({ name: 'user_id', unique: true })
  userId!: string;

  @Column({ type: 'text', nullable: true })
  bio?: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  title?: string;

  @Column({ type: 'integer', default: 0 })
  yearsOfExperience!: number;

  @Column({ default: true })
  isAvailable!: boolean;

  @OneToMany(
    () => MentorSkill,
    (mentorSkill: MentorSkill) => mentorSkill.mentorProfile,
  )
  mentorSkills!: MentorSkill[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
