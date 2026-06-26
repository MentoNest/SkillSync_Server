import { BadRequestException } from '@nestjs/common';
import { StrKey } from 'stellar-sdk';

/**
 * Normalizes a Stellar wallet address:
 * - Trims whitespace
 * - Converts to uppercase (canonical Stellar/base32 form)
 * - Validates with StrKey.isValidEd25519PublicKey
 *
 * @throws BadRequestException for invalid addresses
 */
export function normalizeWalletAddress(address: string): string {
  if (!address || typeof address !== 'string') {
    throw new BadRequestException('Wallet address is required');
  }

  const normalized = address.trim().toUpperCase();

  if (!StrKey.isValidEd25519PublicKey(normalized)) {
    throw new BadRequestException('Invalid Stellar wallet address');
  }

  return normalized;
}
