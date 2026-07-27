import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../../users/entities/user.entity.js';

export enum MentorFeatureAuditAction {
  FEATURED = 'featured',
  UNFEATURED = 'unfeatured',
  ORDER_UPDATED = 'order_updated',
  AUTO_EXPIRED = 'auto_expired',
}

/**
 * #1005: Immutable audit log for every featured-mentor state-change.
 */
@Entity('mentor_feature_audit_logs')
@Index(['mentorId'])
@Index(['adminId'])
export class MentorFeatureAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  mentorId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'mentorId' })
  mentor: User;

  /** Null for system-initiated actions (e.g. auto_expired). */
  @Column({ type: 'uuid', nullable: true })
  adminId: string | null;

  @ManyToOne(() => User, { nullable: true })
  @JoinColumn({ name: 'adminId' })
  admin: User | null;

  @Column({
    type: 'enum',
    enum: MentorFeatureAuditAction,
  })
  action: MentorFeatureAuditAction;

  @Column({ type: 'jsonb', default: () => "'{}'" })
  metadata: Record<string, unknown>;

  @CreateDateColumn()
  createdAt: Date;
}
