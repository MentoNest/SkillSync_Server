import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany, ManyToMany, JoinTable, ManyToOne, JoinColumn, Index } from 'typeorm';
import { Tag } from '../../tag/entities/tag.entity';
import { MentorSkill } from '../../mentor_skills/entities/mentor-skill.entity';

@Entity('skills')
@Index(['slug'], { unique: true })
export class Skill {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  name: string;

  @Column({ unique: true })
  slug: string;


  @Column('text', { array: true, nullable: true })
  aliases?: string[];

  @Column({ type: 'text', nullable: true })
  description?: string;

  @Column({ type: 'int', nullable: true })
  categoryId?: number;

  @OneToMany(() => MentorSkill, mentorSkill => mentorSkill.skill)
  mentorSkills: MentorSkill[];

  @Column({ type: 'tsvector', select: false, nullable: true })
  searchVector?: string;

  @ManyToMany(() => Tag, tag => tag.skills, { cascade: true })
  @JoinTable({ name: 'skill_tags' })
  tags: Tag[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
