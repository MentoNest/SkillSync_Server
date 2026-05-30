import { IsNotEmpty } from 'class-validator';
import { IsStellarAddress } from '../../common/validators/custom-validators';

export class NonceDto {
  @IsStellarAddress()
  @IsNotEmpty()
  walletAddress: string;
}