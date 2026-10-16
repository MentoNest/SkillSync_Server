import { StrKey } from '@stellar/stellar-sdk';

/** Stellar public keys (G...) are base32 and case-insensitive for our purposes; we store them upper-case. */
export function normalizeWalletAddress(input: string): string {
  return (input ?? '').trim().toUpperCase();
}

export function isValidWalletAddress(input: string): boolean {
  return StrKey.isValidEd25519PublicKey(normalizeWalletAddress(input));
}

/** Normalises and validates; throws a plain Error so callers can map it to HTTP 400. */
export function requireValidWalletAddress(input: string): string {
  const normalized = normalizeWalletAddress(input);
  if (!StrKey.isValidEd25519PublicKey(normalized)) {
    throw new Error('Invalid Stellar wallet address');
  }
  return normalized;
}

/** True when two addresses refer to the same wallet regardless of case/whitespace. */
export function walletAddressesEqual(a: string, b: string): boolean {
  return normalizeWalletAddress(a) === normalizeWalletAddress(b);
}
