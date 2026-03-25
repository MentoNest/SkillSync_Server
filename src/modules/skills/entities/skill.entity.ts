import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  ManyToOne,
  JoinColumn,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { SkillCategory } from './skill-category.entity';
import { SkillStatus } from '../../../common/enums/skill-status.enum';

@Entity('skills')
@Index(['name'], { unique: true })
@Index(['slug'], { unique: true })
export class Skill {
  @ApiProperty({ description: 'Skill unique identifier' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: 'Skill name', example: 'TypeScript' })
  @Column({ type: 'varchar', length: 100, unique: true })
  name: string;

  @ApiProperty({ description: 'URL-friendly slug', example: 'typescript' })
  @Column({ type: 'varchar', length: 120, unique: true })
  slug: string;

  @ApiPropertyOptional({ description: 'Optional skill description', example: 'A strongly typed superset of JavaScript' })
  @Column({ type: 'text', nullable: true })
  description?: string;

  @ApiPropertyOptional({ description: 'Category this skill belongs to', type: () => SkillCategory })
  @ManyToOne(() => SkillCategory, (category) => category.skills, {
    nullable: true,
    onDelete: 'SET NULL',
    eager: false,
  })
  @JoinColumn()
  category?: SkillCategory;

  @ApiProperty({ description: 'Skill creation date' })
  @CreateDateColumn()
  createdAt: Date;

  @ApiProperty({ description: 'Skill last update date' })
  @UpdateDateColumn()
  updatedAt: Date;

  // ---------------------------------------------------------------------------
  // Moderation fields
  // ---------------------------------------------------------------------------

  @ApiProperty({ description: 'Skill moderation status', enum: SkillStatus, example: SkillStatus.PENDING })
  @Column({
    type: 'enum',
    enum: SkillStatus,
    default: SkillStatus.PENDING,
  })
  status: SkillStatus;

  @ApiPropertyOptional({ description: 'Reason for rejection if status is rejected' })
  @Column({ type: 'text', nullable: true })
  rejectionReason?: string;

  @ApiPropertyOptional({ description: 'UUID of the admin who moderated this skill' })
  @Column({ type: 'uuid', nullable: true })
  moderatedBy?: string;

  @ApiPropertyOptional({ description: 'Date when the skill was moderated' })
  @Column({ type: 'timestamptz', nullable: true })
  moderatedAt?: Date;
}
