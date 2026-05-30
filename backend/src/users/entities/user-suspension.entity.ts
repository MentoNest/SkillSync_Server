import { BeforeInsert, Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { randomUUID } from 'crypto';
import { User } from './user.entity';

@Entity({ name: 'user_suspensions' })
@Index(['userId'])
@Index(['suspendedAt'])
@Index(['suspendedUntil'])
export class UserSuspension {
  @PrimaryColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'varchar', length: 128 })
  userId!: string;

  @Column({ name: 'reason', type: 'text' })
  reason!: string;

  @Column({ name: 'suspended_by', type: 'varchar', length: 128 })
  suspendedBy!: string;

  @Column({ name: 'suspended_at', type: 'timestamptz', default: () => 'now()' })
  suspendedAt!: Date;

  @Column({ name: 'suspended_until', type: 'timestamptz', nullable: true })
  suspendedUntil!: Date | null;

  @Column({ name: 'lifted_at', type: 'timestamptz', nullable: true })
  liftedAt!: Date | null;

  @Column({ name: 'lifted_by', type: 'varchar', length: 128, nullable: true })
  liftedBy!: string | null;

  @Column({ name: 'lifted_reason', type: 'text', nullable: true })
  liftedReason!: string | null;

  @ManyToOne(() => User, (user) => user.suspensions, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'user_id' })
  user?: User;

  @CreateDateColumn({ name: 'created_at', type: 'timestamptz' })
  createdAt!: Date;

  @UpdateDateColumn({ name: 'updated_at', type: 'timestamptz' })
  updatedAt!: Date;

  @BeforeInsert()
  setId(): void {
    this.id ??= randomUUID();
  }
}
