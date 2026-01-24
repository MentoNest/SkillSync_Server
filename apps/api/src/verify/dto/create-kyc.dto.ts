import { IsEnum, IsOptional, IsString, IsUUID } from 'class-validator';
import { KycStatus } from '../entities/kyc.entity';

export class CreateKycDto {
  @IsUUID()
  userId!: string;

  @IsEnum(KycStatus)
  status!: KycStatus;

  @IsOptional()
  @IsString()
  provider?: string;

  @IsOptional()
  @IsString()
  externalRef?: string;

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  updatedBy?: string;
}
