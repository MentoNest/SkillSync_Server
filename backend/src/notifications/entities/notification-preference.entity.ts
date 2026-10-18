import { Column, Entity, PrimaryGeneratedColumn, Unique } from 'typeorm';
import { NotificationType } from '../notification.types';

/** One row per user and type the user opted out of (absence = enabled). */
@Entity('notification_preferences')
@Unique('UQ_notification_preferences_user_type', ['userId', 'type'])
export class NotificationPreference {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid' })
  userId!: string;

  @Column({ type: 'enum', enum: NotificationType, enumName: 'notifications_type_enum' })
  type!: NotificationType;

  @Column({ type: 'boolean', default: true })
  enabled!: boolean;
}
