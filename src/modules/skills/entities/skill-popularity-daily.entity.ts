import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';
import { ApiProperty } from '@nestjs/swagger';

export enum PopularityEventType {
  SKILL_PAGE_VIEW = 'skill_page_view',
  MENTOR_SKILL_ATTACH = 'mentor_skill_attach',
  SEARCH_CLICK = 'search_click',
  PROFILE_VIEW = 'profile_view',
}

@Entity('skill_popularity_daily')
@Index(['skillId', 'date', 'eventType'], { unique: true })
@Index(['skillId', 'date'])
@Index(['date', 'eventType'])
export class SkillPopularityDaily {
  @ApiProperty({ description: 'Record unique identifier' })
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @ApiProperty({ description: 'Skill ID for quick queries' })
  @Column({ type: 'int' })
  skillId: number;

  @ApiProperty({ description: 'Date of the aggregation', example: '2024-02-24' })
  @Column({ type: 'date' })
  date: Date;

  @ApiProperty({ description: 'Type of popularity event', enum: PopularityEventType })
  @Column({
    type: 'enum',
    enum: PopularityEventType,
  })
  eventType: PopularityEventType;

  @ApiProperty({ description: 'Count of events for this day', example: 42 })
  @Column({ type: 'int', default: 0 })
  count: number;

  @ApiProperty({ description: 'Record creation timestamp' })
  @CreateDateColumn()
  createdAt: Date;
}
