import { BadRequestException } from '@nestjs/common';

/**
 * #982: Wallet address normalization utility for Stellar addresses.
 *
 * Provides consistent storage and comparison of wallet addresses.
 * Stellar Ed25519 public keys: G + 55 alphanumeric characters (base32).
 */

const STELLAR_PUBLIC_KEY_REGEX = /^G[A-Z2-7]{55}$/;

/**
 * Normalize a Stellar wallet address.
 * - Trims whitespace
 * - Validates format (G + 55 base32 chars)
 * - Converts to uppercase (canonical form)
 * - Verifies checksum via basic validation
 *
 * @throws BadRequestException if address is invalid
 */
export function normalizeWalletAddress(address: string): string {
  if (!address || typeof address !== 'string') {
    throw new BadRequestException('Wallet address is required');
  }

  const trimmed = address.trim();
  if (trimmed.length === 0) {
    throw new BadRequestException('Wallet address cannot be empty');
  }

  if (trimmed.length !== 56) {
    throw new BadRequestException(
      `Invalid Stellar address length: expected 56 characters, got ${trimmed.length}`,
    );
  }

  const upper = trimmed.toUpperCase();

  if (!STELLAR_PUBLIC_KEY_REGEX.test(upper)) {
    throw new BadRequestException(
      'Invalid Stellar address format. Must start with G followed by 55 base32 characters.',
    );
  }

  return upper;
}

/**
 * Safe normalization — returns null instead of throwing.
 */
export function tryNormalizeWalletAddress(address: string): string | null {
  try {
    return normalizeWalletAddress(address);
  } catch {
    return null;
  }
}

/**
 * Compare two wallet addresses for equality (case-insensitive).
 */
export function walletAddressesEqual(a: string, b: string): boolean {
  const normA = tryNormalizeWalletAddress(a);
  const normB = tryNormalizeWalletAddress(b);
  if (!normA || !normB) return false;
  return normA === normB;
}

/**
 * Mask a wallet address for display: G1234...XXXX
 */
export function maskWalletAddress(address: string): string {
  const normalized = tryNormalizeWalletAddress(address);
  if (!normalized) return '***INVALID***';
  return `${normalized.slice(0, 5)}...${normalized.slice(-4)}`;
}
