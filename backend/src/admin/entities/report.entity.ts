import { BeforeInsert, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { randomUUID } from 'crypto';
import { User } from '../../users/entities/user.entity';

@Entity({ name: 'reports' })
@Index(['reporterId'])
@Index(['reportedUserId'])
@Index(['status'])
@Index(['type'])
export class Report {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'reporter_id', type: 'uuid' })
  reporterId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reporter_id' })
  reporter!: User;

  @Column({ name: 'reported_user_id', type: 'uuid' })
  reportedUserId!: string;

  @ManyToOne(() => User, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'reported_user_id' })
  reportedUser!: User;

  @Column({ name: 'type', type: 'varchar', length: 32 })
  type!: 'inappropriate_content' | 'spam' | 'harassment' | 'other';

  @Column({ name: 'reason', type: 'text' })
  reason!: string;

  @Column({ name: 'status', type: 'varchar', length: 32, default: 'pending' })
  status!: 'pending' | 'resolved' | 'dismissed';

  @Column({ name: 'resolved_at', type: 'timestamptz', nullable: true })
  resolvedAt!: Date | null;

  @Column({ name: 'resolved_by', type: 'uuid', nullable: true })
  resolvedBy!: string | null;

  @Column({ name: 'admin_notes', type: 'text', nullable: true })
  adminNotes!: string | null;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @BeforeInsert()
  setId(): void {
    this.id ??= randomUUID();
  }
}