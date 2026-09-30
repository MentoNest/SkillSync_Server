import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../user/entities/user.entity.js';

export enum NotificationType {
  SYSTEM = 'system',
  MENTORSHIP = 'mentorship',
  SESSION = 'session',
  PAYMENT = 'payment',
  ACHIEVEMENT = 'achievement',
  REMINDER = 'reminder',
  WARNING = 'warning',
}

export enum NotificationPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
  URGENT = 'urgent',
}

/**
 * #1364: delivery channels. `in_app` is the only channel fully implemented;
 * `email` and `push` persist the intent and are placeholders for a future
 * SendGrid / push-provider integration.
 */
export enum NotificationChannel {
  IN_APP = 'in_app',
  EMAIL = 'email',
  PUSH = 'push',
}

@Entity('notifications')
@Index(['userId', 'read'])
@Index(['createdAt'])
export class Notification {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  userId: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column({ type: 'enum', enum: NotificationType })
  type: NotificationType;

  @Column({ type: 'enum', enum: NotificationPriority, default: NotificationPriority.MEDIUM })
  priority: NotificationPriority;

  @Column({ type: 'varchar', length: 255 })
  title: string;

  @Column({ type: 'text' })
  message: string;

  @Column({ type: 'jsonb', nullable: true })
  metadata: Record<string, any>;

  @Column({ type: 'boolean', default: false })
  read: boolean;

  @Column({ type: 'timestamp', nullable: true })
  readAt: Date;

  @Column({ type: 'varchar', length: 500, nullable: true })
  actionUrl: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  icon: string;

  /**
   * #1364: delivery intent for external channels. `in_app` is always
   * delivered; `email`/`push` entries are queued for the (placeholder)
   * SendGrid / push integrations.
   */
  @Column({ type: 'jsonb', default: () => "'[\"in_app\"]'::jsonb" })
  channels: NotificationChannel[];

  /**
   * #1364: soft expiry for ephemeral notifications (e.g. reminders).
   * Rows past this timestamp are skipped when reading and swept by the
   * retention job. `null` means the row only expires via retention.
   */
  @Column({ type: 'timestamp', nullable: true })
  expiresAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
