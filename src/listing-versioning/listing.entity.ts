import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { ListingVersion } from './listing-version.entity';

export enum ListingStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  PAUSED = 'paused',
  ARCHIVED = 'archived',
}

export enum ListingCategory {
  MENTORSHIP = 'mentorship',
  TUTORING = 'tutoring',
  CONSULTING = 'consulting',
  COACHING = 'coaching',
  WORKSHOP = 'workshop',
}

@Entity('listings')
@Index(['createdBy'])
@Index(['status'])
export class Listing {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 200 })
  title: string;

  @Column({ type: 'text' })
  description: string;

  @Column({ type: 'decimal', precision: 10, scale: 2 })
  price: number;

  @Column({
    type: 'enum',
    enum: ListingCategory,
    default: ListingCategory.MENTORSHIP,
  })
  category: ListingCategory;

  @Column({
    type: 'enum',
    enum: ListingStatus,
    default: ListingStatus.DRAFT,
  })
  status: ListingStatus;

  @Column({ type: 'simple-array', nullable: true })
  tags: string[];

  @Column({ type: 'int', default: 60 })
  durationMinutes: number;

  @Column({ nullable: true, length: 500 })
  coverImageUrl: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, unknown>;

  /** Monotonically increasing. Bumped on every saved change. */
  @Column({ type: 'int', default: 1 })
  currentVersion: number;

  @Column({ type: 'uuid' })
  createdBy: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => ListingVersion, (v) => v.listing, { cascade: false })
  versions: ListingVersion[];
}
