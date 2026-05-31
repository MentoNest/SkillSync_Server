import { IsNotEmpty, IsString } from 'class-validator';
import { IsISODate } from '../../common/validators/custom-validators';

export class NonceResponseDto {
  @IsString()
  @IsNotEmpty()
  nonce: string;

  @IsISODate()
  @IsNotEmpty()
  expiresAt: string;
}