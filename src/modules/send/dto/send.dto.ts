import { IsString, IsNumber, IsOptional, MaxLength, Min } from 'class-validator';
import { Transform } from 'class-transformer';

export class PreviewSendDto {
  @IsString()
  toUsername: string;

  @IsNumber()
  @Min(0.01)
  amountUsdc: number;
}

export class ConfirmSendDto {
  @IsString()
  toUsername: string;

  @IsNumber()
  @Min(0.01)
  amountUsdc: number;

  @IsOptional()
  @IsString()
  @MaxLength(100)
  @Transform(({ value }: { value: string }) => (value ? value.replace(/<[^>]*>/g, '') : value))
  note?: string;

  @IsString()
  pin: string;
}
