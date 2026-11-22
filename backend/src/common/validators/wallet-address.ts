const STELLAR_PUBL_KEY_LENGTH = 56;
const BASE32_ALPHABET = /^[A-Z2-7]+$/;

/**
 * Validate a Stellar ED25519 public key (`G...`, 56 base32 characters).
 * Used by the `@IsValidWalletAddress` decorator and by non-decorator checks.
 */
export function isValidStellarWalletAddress(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    value.length === STELLAR_PUBL_KEY_LENGTH &&
    value.startsWith('G') &&
    BASE32_ALPHABET.test(value)
  );
}
