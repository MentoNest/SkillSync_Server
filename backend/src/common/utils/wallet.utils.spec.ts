import { BadRequestException } from '@nestjs/common';
import { Keypair } from 'stellar-sdk';
import { normalizeWalletAddress } from './wallet.utils';

// Generate a valid Stellar public key once for all tests
const VALID_ADDRESS = Keypair.random().publicKey();

describe('normalizeWalletAddress', () => {
  it('returns the uppercase address unchanged for a valid input', () => {
    expect(normalizeWalletAddress(VALID_ADDRESS)).toBe(VALID_ADDRESS);
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalizeWalletAddress(`  ${VALID_ADDRESS}  `)).toBe(VALID_ADDRESS);
  });

  it('converts lowercase input to uppercase', () => {
    expect(normalizeWalletAddress(VALID_ADDRESS.toLowerCase())).toBe(VALID_ADDRESS);
  });

  it('converts mixed-case input to uppercase', () => {
    const mixed = VALID_ADDRESS.slice(0, 28).toLowerCase() + VALID_ADDRESS.slice(28);
    expect(normalizeWalletAddress(mixed)).toBe(VALID_ADDRESS);
  });

  it('throws BadRequestException for an empty string', () => {
    expect(() => normalizeWalletAddress('')).toThrow(BadRequestException);
  });

  it('throws BadRequestException for a null-like value', () => {
    expect(() => normalizeWalletAddress(null as any)).toThrow(BadRequestException);
  });

  it('throws BadRequestException for a random string', () => {
    expect(() => normalizeWalletAddress('notawalletaddress')).toThrow(BadRequestException);
  });

  it('throws BadRequestException for an address that is too short', () => {
    expect(() => normalizeWalletAddress(VALID_ADDRESS.slice(0, 20))).toThrow(BadRequestException);
  });

  it('throws BadRequestException for an address starting with wrong prefix', () => {
    // Replace the leading 'G' with 'S' to make it look like a secret key
    const badPrefix = 'S' + VALID_ADDRESS.slice(1);
    expect(() => normalizeWalletAddress(badPrefix)).toThrow(BadRequestException);
  });

  it('completes normalization in under 1ms on average', () => {
    const iterations = 100;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      normalizeWalletAddress(VALID_ADDRESS);
    }
    const avgMs = (performance.now() - start) / iterations;
    expect(avgMs).toBeLessThan(1);
  });
});
