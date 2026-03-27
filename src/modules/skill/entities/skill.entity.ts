import { Entity, PrimaryGeneratedColumn, Column, CreateDateColumn, UpdateDateColumn, OneToMany, ManyToMany, JoinTable, ManyToOne, JoinColumn, Index, BeforeInsert, BeforeUpdate } from 'typeorm';
import { Tag } from '../../tag/entities/tag.entity';
import { MentorSkill } from '../../mentor_skills/entities/mentor-skill.entity';
import { SkillStatus } from '../../../common/enums/skill-status.enum';

/**
 * Normalizes a skill name for duplicate detection:
 * - Lowercase
 * - Trim whitespace
 * - Collapse multiple spaces to single space
 */
export function normalizeSkillName(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ');
}

@Entity('skills')
@Index(['slug'], { unique: true })
@Index(['normalizedName'], { unique: true })
export class Skill {
  @PrimaryGeneratedColumn()
  id: number;

  @Column({ unique: true })
  name: string;

  @Column({ unique: true })
  normalizedName: string;

  @Column({ unique: true })
  slug: string;

  @BeforeInsert()
  @BeforeUpdate()
  updateNormalizedName() {
    this.normalizedName = normalizeSkillName(this.name);
  }


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

  // ---------------------------------------------------------------------------
  // Moderation fields
  // ---------------------------------------------------------------------------

  @Column({
    type: 'enum',
    enum: SkillStatus,
    default: SkillStatus.PENDING,
  })
  status: SkillStatus;

  @Column({ type: 'text', nullable: true })
  rejectionReason?: string;

  @Column({ type: 'uuid', nullable: true })
  moderatedBy?: string;

  @Column({ type: 'timestamptz', nullable: true })
  moderatedAt?: Date;
}
