import { BadRequestException } from '@nestjs/common';
import { normalizeWalletAddress } from '../utils/wallet.utils';

/**
 * Validate a Stellar ED25519 public key, including its checksum.
 * Used by the `@IsValidWalletAddress` decorator and by non-decorator checks.
 */
export function isValidStellarWalletAddress(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    normalizeWalletAddress(value);
    return true;
  } catch (error) {
    if (error instanceof BadRequestException) return false;
    throw error;
  }
}
