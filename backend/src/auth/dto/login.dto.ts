import { IsBase64, IsString, Matches, MaxLength } from 'class-validator';
import { STELLAR_ADDRESS } from './nonce.dto';

export class LoginDto {
  @IsString()
  @Matches(STELLAR_ADDRESS, { message: 'address must be a valid Stellar public key' })
  address!: string;

  /** Base64 ed25519 signature of the login message returned by `POST /auth/nonce`. */
  @IsBase64()
  @MaxLength(128)
  signature!: string;
}
