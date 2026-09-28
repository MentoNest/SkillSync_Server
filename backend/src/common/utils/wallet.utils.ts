import { BadRequestException } from '@nestjs/common';
import { StrKey } from '@stellar/stellar-sdk';

/**
 * Validates whether a given string is a valid Stellar Ed25519 public key.
 * Trims leading/trailing whitespace and performs case-insensitive validation.
 */
export function isValidWalletAddress(address?: string | null): boolean {
  if (!address || typeof address !== 'string') {
    return false;
  }

  const trimmed = address.trim();
  if (trimmed.length !== 56) {
    return false;
  }

  return StrKey.isValidEd25519PublicKey(trimmed.toUpperCase());
}

/**
 * Normalizes a Stellar wallet address for consistent storage and comparison.
 * Trims whitespace, validates the Ed25519 public key checksum, and converts to lowercase.
 *
 * @param address Stellar wallet public key address string
 * @returns Normalized lowercase wallet address
 * @throws BadRequestException if address is invalid or malformed
 */
export function normalizeWalletAddress(address: string): string {
  if (!address || typeof address !== 'string') {
    throw new BadRequestException('Wallet address is required and must be a string');
  }

  const trimmed = address.trim();
  if (!trimmed) {
    throw new BadRequestException('Wallet address cannot be empty');
  }

  const upper = trimmed.toUpperCase();
  if (!StrKey.isValidEd25519PublicKey(upper)) {
    throw new BadRequestException('Invalid Stellar wallet address format');
  }

  return trimmed.toLowerCase();
}

/**
 * Compares two Stellar wallet addresses in a case-insensitive, normalized manner.
 */
export function compareWalletAddresses(address1: string, address2: string): boolean {
  try {
    return normalizeWalletAddress(address1) === normalizeWalletAddress(address2);
  } catch {
    return false;
  }
}

/**
 * Converts a wallet address to canonical Stellar uppercase format for Stellar network operations.
 */
export function toCanonicalStellarAddress(address: string): string {
  if (!isValidWalletAddress(address)) {
    throw new BadRequestException('Invalid Stellar wallet address format');
  }
  return address.trim().toUpperCase();
}
