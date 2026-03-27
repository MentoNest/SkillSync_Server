import { Entity, PrimaryGeneratedColumn, ManyToOne, JoinColumn, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { MentorProfile } from '../../profile/entities/mentor-profile.entity';
import { Skill } from '../../skill/entities/skill.entity';

@Entity('mentor_skills')
export class MentorSkill {
  @PrimaryGeneratedColumn()
  id: number;

  @ManyToOne(() => MentorProfile, mentor => mentor.mentorSkills, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'mentor_id' })
  mentor: MentorProfile;

  @ManyToOne(() => Skill, skill => skill.mentorSkills, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'skill_id' })
  skill: Skill;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
