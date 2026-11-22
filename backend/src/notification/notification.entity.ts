import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { User } from '../user/user.entity';
import { NotificationType } from './notification.types';

@Entity('notifications')
@Index('idx_notifications_user_created', ['userId', 'createdAt'])
@Index('idx_notifications_user_read_created', ['userId', 'isRead', 'createdAt'])
export class Notification {
  @ApiProperty()
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ApiProperty({ description: 'Wallet address of the recipient.' })
  @Column({ name: 'user_id', type: 'varchar', length: 56 })
  userId!: string;

  @ApiProperty({ enum: NotificationType })
  @Column({
    type: 'enum',
    enum: NotificationType,
    enumName: 'notification_type_enum',
  })
  type!: NotificationType;

  @ApiProperty()
  @Column({ type: 'varchar', length: 200 })
  title!: string;

  @ApiProperty()
  @Column({ type: 'varchar', length: 2000 })
  body!: string;

  @ApiPropertyOptional({ type: 'object', additionalProperties: true })
  @Column({ type: 'jsonb', default: () => "'{}'::jsonb" })
  data!: Record<string, unknown>;

  @ApiProperty()
  @Column({ name: 'is_read', type: 'boolean', default: false })
  isRead!: boolean;

  @ApiProperty()
  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id', referencedColumnName: 'walletAddress' })
  user?: User;
}
