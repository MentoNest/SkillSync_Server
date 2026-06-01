import { BeforeInsert, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { randomUUID } from 'crypto';
import { User } from '../../users/entities/user.entity';

@Entity({ name: 'flagged_content' })
@Index(['contentId'])
@Index(['contentType'])
@Index(['status'])
export class FlaggedContent {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'content_id', type: 'uuid' })
  contentId!: string;

  @Column({ name: 'content_type', type: 'varchar', length: 32 })
  contentType!: 'portfolio_link' | 'message' | 'review' | 'profile';

  @Column({ name: 'reason', type: 'text' })
  reason!: string;

  @Column({ name: 'flagged_by', type: 'uuid' })
  flaggedBy!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'flagged_by' })
  flaggedByUser!: User;

  @Column({ name: 'status', type: 'varchar', length: 32, default: 'flagged' })
  status!: 'flagged' | 'removed' | 'restored';

  @Column({ name: 'removed_at', type: 'timestamptz', nullable: true })
  removedAt!: Date | null;

  @Column({ name: 'removed_by', type: 'uuid', nullable: true })
  removedBy!: string | null;

  @Column({ name: 'restored_at', type: 'timestamptz', nullable: true })
  restoredAt!: Date | null;

  @Column({ name: 'restored_by', type: 'uuid', nullable: true })
  restoredBy!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @BeforeInsert()
  setId(): void {
    this.id ??= randomUUID();
  }
}