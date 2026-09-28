import { BadRequestException } from '@nestjs/common';

import {
  compareWalletAddresses,
  isValidWalletAddress,
  normalizeWalletAddress,
  toCanonicalStellarAddress,
} from './wallet.utils.js';

// Real, checksum-valid Stellar Ed25519 public keys.
const VALID_A = 'GA53RLWVN3HAIYZX2RD3XW4LYHPCE4JC2HL4YVPRVKCDXHDU2OAWT2GI';
const VALID_B = 'GBAIV5QDRWW3DJ66W5A6SMCPSOGYOIL7O66TU5XTJRZ4WPV6NO5SIYVJ';
// Same key as VALID_A with the final character changed, which breaks the
// base32 checksum and must therefore be rejected.
const BAD_CHECKSUM =
  'GA53RLWVN3HAIYZX2RD3XW4LYHPCE4JC2HL4YVPRVKCDXHDU2OAWT2GA';

describe('normalizeWalletAddress', () => {
  it('returns a valid address unchanged in canonical lowercase form', () => {
    expect(normalizeWalletAddress(VALID_A)).toBe(VALID_A.toLowerCase());
  });

  it('trims leading and trailing whitespace', () => {
    expect(normalizeWalletAddress(`  ${VALID_A}  `)).toBe(VALID_A.toLowerCase());
    expect(normalizeWalletAddress(`\t${VALID_A}\n`)).toBe(VALID_A.toLowerCase());
  });

  it('standardizes mixed-case input to lowercase', () => {
    const mixed = `${VALID_A.slice(0, 20).toLowerCase()}${VALID_A.slice(20)}`;
    expect(normalizeWalletAddress(mixed)).toBe(VALID_A.toLowerCase());
  });

  it('normalizes surrounding whitespace and mixed case together', () => {
    const messy = `  ${VALID_A.toLowerCase()}  `;
    expect(normalizeWalletAddress(messy)).toBe(VALID_A.toLowerCase());
  });

  it('is idempotent', () => {
    const once = normalizeWalletAddress(` ${VALID_A} `);
    expect(normalizeWalletAddress(once)).toBe(once);
  });

  it('rejects an address with a broken checksum', () => {
    expect(() => normalizeWalletAddress(BAD_CHECKSUM)).toThrow(BadRequestException);
  });

  it.each([
    ['empty string', ''],
    ['whitespace only', '    '],
    ['too short', 'GABC'],
    ['not a Stellar address', '0x1234567890abcdef'],
    ['a secp256k1 public key', 'GCZBK7YQBPZ2WXPXNVJ4XWFXKQ4M2K3YQK2M2K3YQK2M2K3YQ'],
  ])('rejects %s', (_label, value) => {
    expect(() => normalizeWalletAddress(value)).toThrow(BadRequestException);
  });

  it('rejects non-string and nullish inputs', () => {
    expect(() => normalizeWalletAddress(undefined as unknown as string)).toThrow(
      BadRequestException,
    );
    expect(() => normalizeWalletAddress(null as unknown as string)).toThrow(
      BadRequestException,
    );
    expect(() => normalizeWalletAddress(12345 as unknown as string)).toThrow(
      BadRequestException,
    );
  });

  it('throws a BadRequestException with a descriptive message', () => {
    expect(() => normalizeWalletAddress('not-a-wallet')).toThrow(
      /Invalid Stellar wallet address format/,
    );
  });
});

describe('isValidWalletAddress', () => {
  it('accepts valid addresses regardless of case or padding', () => {
    expect(isValidWalletAddress(VALID_A)).toBe(true);
    expect(isValidWalletAddress(VALID_A.toLowerCase())).toBe(true);
    expect(isValidWalletAddress(`  ${VALID_A}  `)).toBe(true);
  });

  it('rejects invalid input without throwing', () => {
    expect(isValidWalletAddress(BAD_CHECKSUM)).toBe(false);
    expect(isValidWalletAddress('')).toBe(false);
    expect(isValidWalletAddress(undefined)).toBe(false);
    expect(isValidWalletAddress(null)).toBe(false);
    expect(isValidWalletAddress(42 as unknown as string)).toBe(false);
  });
});

describe('compareWalletAddresses', () => {
  it('treats differently cased forms of the same key as equal', () => {
    expect(compareWalletAddresses(VALID_A, VALID_A.toLowerCase())).toBe(true);
  });

  it('ignores surrounding whitespace', () => {
    expect(compareWalletAddresses(` ${VALID_A} `, VALID_A)).toBe(true);
  });

  it('returns false for two different addresses', () => {
    expect(compareWalletAddresses(VALID_A, VALID_B)).toBe(false);
  });

  it('returns false rather than throwing for invalid input', () => {
    expect(compareWalletAddresses('nope', VALID_A)).toBe(false);
    expect(compareWalletAddresses(VALID_A, 'nope')).toBe(false);
  });
});

describe('toCanonicalStellarAddress', () => {
  it('returns the uppercase form used for Stellar network calls', () => {
    expect(toCanonicalStellarAddress(VALID_A.toLowerCase())).toBe(VALID_A);
    expect(toCanonicalStellarAddress(` ${VALID_A} `)).toBe(VALID_A);
  });

  it('throws for an invalid address', () => {
    expect(() => toCanonicalStellarAddress(BAD_CHECKSUM)).toThrow(BadRequestException);
  });
});

describe('performance', () => {
  it('normalizes well under 1ms per address', () => {
    const iterations = 2000;
    const start = performance.now();
    for (let i = 0; i < iterations; i++) {
      normalizeWalletAddress(VALID_A);
    }
    const perCallMs = (performance.now() - start) / iterations;

    expect(perCallMs).toBeLessThan(1);
  });
});
