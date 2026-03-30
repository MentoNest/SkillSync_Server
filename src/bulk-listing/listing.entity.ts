import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
} from 'typeorm';
import { ListingStatus } from '../dto/bulk-listing-update.dto';

@Entity('listings')
@Index(['status'])
@Index(['category'])
export class Listing {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ length: 200 })
  title: string;

  @Column({ type: 'text', nullable: true })
  description: string | null;

  @Column({ type: 'enum', enum: ListingStatus, default: ListingStatus.DRAFT })
  status: ListingStatus;

  /** Price stored in minor units (kobo / cents) */
  @Column({ type: 'int', default: 0 })
  price: number;

  @Column({ length: 100, nullable: true })
  category: string | null;

  @Column({ default: false })
  isFeatured: boolean;

  @Column({ type: 'int', nullable: true })
  maxMentees: number | null;

  /** FK to owner / mentor – adjust to your actual User entity */
  @Column({ type: 'uuid' })
  ownerId: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
