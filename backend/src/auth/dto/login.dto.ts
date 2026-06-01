import { IsNotEmpty, IsString } from 'class-validator';
import { IsStellarAddress, IsStellarSignature } from '../../common/validators/custom-validators';

export class LoginDto {
  @IsStellarAddress()
  @IsNotEmpty()
  walletAddress: string;

  @IsStellarSignature()
  @IsNotEmpty()
  signature: string;

  @IsString()
  @IsNotEmpty()
  nonce: string;
}
