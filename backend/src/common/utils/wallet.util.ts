import { BadRequestException } from '@nestjs/common';
import { StrKey } from 'stellar-sdk';

/**
 * Normalises a Stellar wallet address for consistent storage and comparison.
 *
 * Steps:
 * 1. Trim surrounding whitespace.
 * 2. Convert to uppercase (Stellar addresses are case-insensitive in practice).
 * 3. Validate the resulting string is a valid Ed25519 public key (G...).
 *
 * @throws BadRequestException if the address is invalid after normalisation.
 */
export function normalizeWalletAddress(raw: string): string {
  if (typeof raw !== 'string') {
    throw new BadRequestException('Wallet address must be a string');
  }

  const normalized = raw.trim().toUpperCase();

  if (!StrKey.isValidEd25519PublicKey(normalized)) {
    throw new BadRequestException(
      `Invalid Stellar wallet address: "${raw}"`,
    );
  }

  return normalized;
}

/**
 * Returns true if two wallet addresses refer to the same account,
 * regardless of case or surrounding whitespace.
 */
export function walletAddressesEqual(a: string, b: string): boolean {
  try {
    return normalizeWalletAddress(a) === normalizeWalletAddress(b);
  } catch {
    return false;
  }
}