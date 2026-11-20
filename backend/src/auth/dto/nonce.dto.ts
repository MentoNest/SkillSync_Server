import { IsString, Matches } from 'class-validator';

/** Stellar account public key (G..., 56 chars of base32). */
export const STELLAR_ADDRESS = /^G[A-Z2-7]{55}$/;

export class NonceDto {
  @IsString()
  @Matches(STELLAR_ADDRESS, { message: 'address must be a valid Stellar public key' })
  address!: string;
}
