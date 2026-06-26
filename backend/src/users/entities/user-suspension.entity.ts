import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

@Entity({ name: 'user_suspensions' })
export class UserSuspension {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column()
  userId: string;

  @Column({ type: 'text' })
  reason: string;

  @Column()
  suspendedBy: string;

  @CreateDateColumn()
  suspendedAt: Date;

  @Column({ nullable: true, default: null })
  suspendedUntil: Date | null;

  @Column({ default: true })
  isActive: boolean;
}
