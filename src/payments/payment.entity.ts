import { PaymentStatus } from 'src/common/enums/PaymentStatus.enum';
import { Entity, PrimaryGeneratedColumn, Column } from 'typeorm';

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

  @Column({ nullable: false })
  userId: string;    //suppose to be a payment->user relation
}
