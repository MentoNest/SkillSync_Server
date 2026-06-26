import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

export type ProfileType = 'mentor' | 'mentee' | 'user';
export type ChangeReason = 'user_edit' | 'admin_edit' | 'system';

@Entity({ name: 'profile_history' })
export class ProfileHistory {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  userId: string;

  @Column()
  profileType: ProfileType;

  @Column()
  fieldName: string;

  @Column({ type: 'jsonb', nullable: true })
  oldValue: unknown;

  @Column({ type: 'jsonb', nullable: true })
  newValue: unknown;

  @Column()
  changedBy: string;

  @Column({ default: 'user_edit' })
  changeReason: ChangeReason;

  @CreateDateColumn({ precision: 3 })
  timestamp: Date;
}
