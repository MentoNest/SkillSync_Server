import { IsString, IsNotEmpty, Matches } from 'class-validator';

/**
 * #972: DTO for requesting a login nonce.
 * The wallet address is used to generate a unique, time-limited nonce
 * that the user signs to prove ownership.
 */
export class RequestNonceDto {
  @IsString()
  @IsNotEmpty()
  @Matches(/^G[A-Z0-9]{55}$/, { message: 'Invalid Stellar public key format' })
  walletAddress: string;
}
