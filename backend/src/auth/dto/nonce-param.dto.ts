import { IsNotEmpty } from 'class-validator';
import { IsStellarAddress } from '../../common/validators/custom-validators';

export class NonceParamDto {
  @IsStellarAddress()
  @IsNotEmpty()
  walletAddress: string;
}
