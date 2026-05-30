export function isValidStellarAddress(address: string): boolean {
  /**
   * Stellar public keys:
   * - Start with G
   * - 56 chars
   */

  return /^G[A-Z2-7]{55}$/.test(address);
}