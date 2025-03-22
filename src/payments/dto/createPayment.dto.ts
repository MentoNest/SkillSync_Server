export class CreatePaymentDto {
  readonly amount: number;
  readonly method: string;
  readonly description?: string;
}