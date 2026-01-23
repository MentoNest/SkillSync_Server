import { Entity, Column, PrimaryGeneratedColumn, ManyToOne, JoinColumn, Unique, CreateDateColumn, UpdateDateColumn } from 'typeorm';
import { User } from '../../users/entities/user.entity';

export enum KycStatus {
  UNVERIFIED = 'unverified',
  PENDING = 'pending',
  VERIFIED = 'verified',
  REJECTED = 'rejected',
}

@Entity('kyc')
@Unique(['user'])
export class Kyc {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @ManyToOne(() => User, { eager: true })
  @JoinColumn({ name: 'user_id' })
  user!: User;

  @Column({
    type: 'enum',
    enum: KycStatus,
    default: KycStatus.UNVERIFIED,
  })
  status!: KycStatus;

  @Column({ type: 'varchar', nullable: true })
  provider: string | null = null;

  @Column({ type: 'varchar', nullable: true })
  externalRef: string | null = null;

  @Column({ type: 'text', nullable: true })
  reason: string | null = null;

  @Column({ type: 'varchar', nullable: true })
  updatedBy: string | null = null;

  @CreateDateColumn()
  createdAt!: Date;

  @UpdateDateColumn()
  updatedAt!: Date;
}