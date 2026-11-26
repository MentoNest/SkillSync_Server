import { BadRequestException } from '@nestjs/common';
import { StrKey } from '@stellar/stellar-sdk';

/**
 * Validates a Stellar Ed25519 public key and returns its lowercase canonical form.
 * Stellar StrKeys use case-insensitive base32 text in application comparisons,
 * while the SDK requires uppercase input for checksum validation.
 */
export function normalizeWalletAddress(address: string): string {
  if (typeof address !== 'string') {
    throw new BadRequestException(
      'Invalid Stellar wallet address: expected a valid Ed25519 public key.',
    );
  }
  const normalized = address.trim().toUpperCase();
  if (!StrKey.isValidEd25519PublicKey(normalized)) {
    throw new BadRequestException(
      'Invalid Stellar wallet address: expected a valid Ed25519 public key.',
    );
  }
  return normalized.toLowerCase();
}
