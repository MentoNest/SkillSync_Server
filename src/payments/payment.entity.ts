import { PaymentStatus } from 'src/common/enums/PaymentStatus.enum';
import { User } from 'src/users/user.entity';
import { Entity, PrimaryGeneratedColumn, Column, UpdateDateColumn, CreateDateColumn, ManyToOne, JoinColumn } from 'typeorm';

@Entity()
export class Payment {
  @PrimaryGeneratedColumn()
  id: number;

  @Column()
  transactionId: string;

  @Column()
  amount: number;

  @Column()
  paymentMethod: string;

  @Column({
    type: 'enum',
    nullable: false,
    enum: PaymentStatus,
    default: PaymentStatus.PENDING,
  })
  status: PaymentStatus;

  @Column({ nullable: true })
  description?: string;

  @CreateDateColumn(
    {
      type: 'timestamptz',
      default: () => 'CURRENT_TIMESTAMP',
    },
  )
  createdAt: Date;

  @UpdateDateColumn(
    {
      type: 'timestamptz',
      default: () => 'CURRENT_TIMESTAMP',
    },
  )
  updatedAt: Date;

  @ManyToOne(() => User, (user) => user.payments)
  @JoinColumn({ name: 'user_id' }) 
  user: User;
}
