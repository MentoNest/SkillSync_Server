import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  OneToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { User } from '../user/entities/user.entity.js';
import { NotificationChannel, NotificationType } from './notification.entity.js';

/**
 * #1364: per-user notification preferences.
 *
 * A user can opt out of whole delivery channels (e.g. `push`) or of specific
 * notification types (e.g. `achievement`). The row is created lazily on first
 * read — an absent row means "everything enabled" so existing users keep
 * receiving notifications without a data migration.
 */
@Entity('notification_preferences')
@Index('IDX_notification_preferences_userId', ['userId'], { unique: true })
export class NotificationPreference {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid', unique: true })
  userId: string;

  @OneToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'userId' })
  user: User;

  /** Channels the user opted out of. An empty list means all channels on. */
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  disabledChannels: NotificationChannel[];

  /** Notification types the user opted out of. Empty means all types on. */
  @Column({ type: 'jsonb', default: () => "'[]'::jsonb" })
  disabledTypes: NotificationType[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
