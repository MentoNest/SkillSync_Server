import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

export type ProfileType = 'mentor' | 'mentee';
export type ChangeSource = 'user_edit' | 'admin_edit' | 'system';

@Entity('profile_history')
@Index(['userId'])
export class ProfileHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column()
  @Index()
  userId: string;

  @Column({ type: 'varchar' })
  profileType: ProfileType;

  @Column()
  fieldName: string;

  @Column({ type: 'jsonb', nullable: true })
  oldValue: unknown;

  @Column({ type: 'jsonb', nullable: true })
  newValue: unknown;

  @Column({ nullable: true })
  changedBy: string; // userId of editor, or 'system'

  @Column({ type: 'varchar', default: 'user_edit' })
  changeSource: ChangeSource;

  @CreateDateColumn({ precision: 3 })
  changedAt: Date;
}
