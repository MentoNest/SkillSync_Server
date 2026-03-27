import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  OneToMany,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Skill } from './skill.entity';

@Entity('skill_categories')
@Index(['name'], { unique: true })
@Index(['slug'], { unique: true })
export class SkillCategory {
  @ApiProperty({ description: 'Category unique identifier' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: 'Category name', example: 'Web Development' })
  @Column({ type: 'varchar', length: 100, unique: true })
  name: string;

  @ApiProperty({ description: 'URL-friendly slug', example: 'web-development' })
  @Column({ type: 'varchar', length: 120, unique: true })
  slug: string;

  @ApiPropertyOptional({ description: 'Optional category description', example: 'Skills related to building web applications' })
  @Column({ type: 'text', nullable: true })
  description?: string;

  @ApiProperty({ description: 'Skills belonging to this category', type: () => [Skill] })
  @OneToMany(() => Skill, (skill) => skill.category, { cascade: false })
  skills: Skill[];

  @ApiProperty({ description: 'Category creation date' })
  @CreateDateColumn()
  createdAt: Date;

  @ApiProperty({ description: 'Category last update date' })
  @UpdateDateColumn()
  updatedAt: Date;
}
