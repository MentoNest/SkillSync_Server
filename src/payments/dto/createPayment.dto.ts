import { ApiProperty } from "@nestjs/swagger";
import { PaymentStatus } from "src/common/enums/PaymentStatus.enum";

export class CreatePaymentDto {
  @ApiProperty({ example: '', description: 'Transaction id' })
  readonly transactionId: string;

  @ApiProperty({ example: '200', description: 'Transaction amount' })
  readonly amount: number;

  @ApiProperty({ example: 'cypto', description: 'Payment method' })
  readonly paymentMethod: string;

  @ApiProperty({ example: 'completed', description: 'Payment status' })
  status: PaymentStatus;
  
  @ApiProperty({ example: '', description: 'Payment description' })
  readonly description?: string;

  @ApiProperty({ example: '', description: 'User id' })
  readonly userId: string;
}