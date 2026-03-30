import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { Listing } from './listing.entity';

export interface ListingSnapshot {
  title: string;
  description: string;
  price: number;
  category: string;
  status: string;
  tags: string[];
  durationMinutes: number;
  coverImageUrl: string | null;
  metadata: Record<string, unknown> | null;
}

export interface FieldDiff {
  field: string;
  from: unknown;
  to: unknown;
}

@Entity('listing_versions')
@Unique(['listingId', 'versionNumber'])
@Index(['listingId', 'versionNumber'])
@Index(['changedBy'])
export class ListingVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  listingId: string;

  @ManyToOne(() => Listing, (l) => l.versions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'listingId' })
  listing: Listing;

  /** Sequential integer (1, 2, 3 …) per listing */
  @Column({ type: 'int' })
  versionNumber: number;

  /**
   * Full immutable snapshot of the listing at the moment this version
   * was captured. Stored as JSONB so it is queryable.
   */
  @Column({ type: 'jsonb' })
  snapshot: ListingSnapshot;

  /**
   * Array of field-level diffs relative to the PREVIOUS version.
   * Empty array for version 1 (initial capture).
   */
  @Column({ type: 'jsonb', default: [] })
  changedFields: FieldDiff[];

  /** Optional human-readable note explaining why the change was made */
  @Column({ type: 'varchar', length: 500, nullable: true })
  changeNote: string | null;

  /** ID of the user who triggered this version save */
  @Column({ type: 'uuid' })
  changedBy: string;

  @CreateDateColumn()
  createdAt: Date;
}
