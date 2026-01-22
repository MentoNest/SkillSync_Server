import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  Unique,
  Index,
} from 'typeorm';
import { MentorProfile } from './mentor-profile.entity';
import { Skill } from './skill.entity';

export enum SkillLevel {
  BEGINNER = 'beginner',
  INTERMEDIATE = 'intermediate',
  EXPERT = 'expert',
}

@Entity('mentor_skills')
@Unique(['mentorProfileId', 'skillId'])
@Index(['mentorProfileId'])
@Index(['skillId'])
export class MentorSkill {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => MentorProfile, (mentorProfile: MentorProfile) => mentorProfile.mentorSkills, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'mentor_profile_id' })
  mentorProfile!: MentorProfile;

  @Column({ name: 'mentor_profile_id' })
  mentorProfileId!: string;

  @ManyToOne(() => Skill, (skill: Skill) => skill.mentorSkills, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'skill_id' })
  skill!: Skill;

  @Column({ name: 'skill_id' })
  skillId!: string;

  @Column({
    type: 'enum',
    enum: SkillLevel,
    default: SkillLevel.BEGINNER,
  })
  level!: SkillLevel;

  @Column({ name: 'years_experience', type: 'integer', default: 0 })
  yearsExperience!: number;
}
