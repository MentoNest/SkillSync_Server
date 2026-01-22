import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { MentorSkill } from '../entities/mentor-skill.entity';

@Entity('skills')
export class Skill {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ unique: true })
  name!: string;

  @Column({ unique: true })
  @Index()
  slug!: string;

  @Column({ nullable: true })
  category?: string;

  @OneToMany(() => MentorSkill, (mentorSkill: MentorSkill) => mentorSkill.skill)
  mentorSkills!: MentorSkill[];

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}
