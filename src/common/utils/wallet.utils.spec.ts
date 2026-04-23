import { BadRequestException } from '@nestjs/common';
import {
  normalizeWalletAddress,
  compareWalletAddresses,
  isValidWalletAddress,
} from './wallet.utils';
import * as StellarSdk from 'stellar-sdk';

describe('Wallet Utils', () => {
  // Generate a valid Stellar address for testing
  const keypair = StellarSdk.Keypair.random();
  const validAddress = keypair.publicKey();
  const validAddressLowercase = validAddress.toLowerCase();
  const validAddressUppercase = validAddress.toUpperCase();

  describe('normalizeWalletAddress', () => {
    it('should normalize valid uppercase address to lowercase', () => {
      const result = normalizeWalletAddress(validAddressUppercase);
      expect(result).toBe(validAddressLowercase);
      expect(result).toMatch(/^g[a-z0-9]{54}$/);
    });

    it('should normalize valid lowercase address', () => {
      const result = normalizeWalletAddress(validAddressLowercase);
      expect(result).toBe(validAddressLowercase);
    });

    it('should normalize valid mixed-case address', () => {
      const mixedCase = validAddress.substring(0, 10) + 
                       validAddress.substring(10).toLowerCase();
      const result = normalizeWalletAddress(mixedCase);
      expect(result).toBe(validAddressLowercase);
    });

    it('should trim leading whitespace', () => {
      const result = normalizeWalletAddress(`   ${validAddress}`);
      expect(result).toBe(validAddressLowercase);
    });

    it('should trim trailing whitespace', () => {
      const result = normalizeWalletAddress(`${validAddress}   `);
      expect(result).toBe(validAddressLowercase);
    });

    it('should trim both leading and trailing whitespace', () => {
      const result = normalizeWalletAddress(`  \t\n${validAddress}\n\t  `);
      expect(result).toBe(validAddressLowercase);
    });

    it('should throw BadRequestException for null', () => {
      expect(() => normalizeWalletAddress(null as any)).toThrow(
        BadRequestException,
      );
      expect(() => normalizeWalletAddress(null as any)).toThrow(
        /non-empty string/,
      );
    });

    it('should throw BadRequestException for undefined', () => {
      expect(() => normalizeWalletAddress(undefined as any)).toThrow(
        BadRequestException,
      );
      expect(() => normalizeWalletAddress(undefined as any)).toThrow(
        /non-empty string/,
      );
    });

    it('should throw BadRequestException for empty string', () => {
      expect(() => normalizeWalletAddress('')).toThrow(BadRequestException);
      expect(() => normalizeWalletAddress('')).toThrow(/empty or contain only whitespace/);
    });

    it('should throw BadRequestException for whitespace-only string', () => {
      expect(() => normalizeWalletAddress('   \t\n   ')).toThrow(
        BadRequestException,
      );
      expect(() => normalizeWalletAddress('   \t\n   ')).toThrow(
        /empty or contain only whitespace/,
      );
    });

    it('should throw BadRequestException for non-string input', () => {
      expect(() => normalizeWalletAddress(123 as any)).toThrow(
        BadRequestException,
      );
      expect(() => normalizeWalletAddress({} as any)).toThrow(
        BadRequestException,
      );
      expect(() => normalizeWalletAddress([] as any)).toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException for address that is too short', () => {
      const tooShort = 'GBRPYHIL2CI3WHZDTOOQFC6EB4SJJSUM3ZULQ4XFJLROVYUCHA';
      expect(() => normalizeWalletAddress(tooShort)).toThrow(
        BadRequestException,
      );
      expect(() => normalizeWalletAddress(tooShort)).toThrow(
        /56 characters long/,
      );
    });

    it('should throw BadRequestException for address that is too long', () => {
      const tooLong = validAddress + 'X';
      expect(() => normalizeWalletAddress(tooLong)).toThrow(
        BadRequestException,
      );
      expect(() => normalizeWalletAddress(tooLong)).toThrow(
        /56 characters long/,
      );
    });

    it('should throw BadRequestException for invalid format (not starting with G)', () => {
      const invalidFormat = 'A' + validAddress.substring(1);
      expect(() => normalizeWalletAddress(invalidFormat)).toThrow(
        BadRequestException,
      );
      expect(() => normalizeWalletAddress(invalidFormat)).toThrow(
        /Ed25519 public key/,
      );
    });

    it('should throw BadRequestException for invalid checksum', () => {
      // Modify the last character to corrupt the checksum
      const corruptedAddress = validAddress.substring(0, 55) + 'X';
      expect(() => normalizeWalletAddress(corruptedAddress)).toThrow(
        BadRequestException,
      );
      expect(() => normalizeWalletAddress(corruptedAddress)).toThrow(
        /Checksum verification failed/,
      );
    });

    it('should throw BadRequestException for invalid characters', () => {
      const invalidChars = 'GBRPYHIL2CI3WHZDTOOQFC6EB4SJJSUM3ZULQ4XFJLROVYUCHARSE@#';
      expect(() => normalizeWalletAddress(invalidChars)).toThrow(
        BadRequestException,
      );
    });

    it('should handle multiple consecutive spaces', () => {
      const result = normalizeWalletAddress(
        `    ${validAddress}      `,
      );
      expect(result).toBe(validAddressLowercase);
    });

    it('should handle tab and newline characters', () => {
      const result = normalizeWalletAddress(
        `\t\t${validAddress}\n\n`,
      );
      expect(result).toBe(validAddressLowercase);
    });

    it('should verify checksum integrity for valid addresses', () => {
      // This implicitly tests checksum verification
      const another = StellarSdk.Keypair.random().publicKey();
      const result = normalizeWalletAddress(another);
      expect(result).toBeTruthy();
      expect(result.length).toBe(56);
    });

    it('should have sub-1ms performance for normalization', () => {
      const startTime = performance.now();
      for (let i = 0; i < 1000; i++) {
        normalizeWalletAddress(`  ${validAddress}  `);
      }
      const endTime = performance.now();
      const avgTime = (endTime - startTime) / 1000;
      expect(avgTime).toBeLessThan(1); // Less than 1ms per address
    });
  });

  describe('compareWalletAddresses', () => {
    it('should return true for identical addresses in different cases', () => {
      const result = compareWalletAddresses(
        validAddressUppercase,
        validAddressLowercase,
      );
      expect(result).toBe(true);
    });

    it('should return true for identical addresses with whitespace', () => {
      const result = compareWalletAddresses(
        `  ${validAddressUppercase}  `,
        `\t${validAddressLowercase}\n`,
      );
      expect(result).toBe(true);
    });

    it('should return true for identical addresses', () => {
      const result = compareWalletAddresses(validAddress, validAddress);
      expect(result).toBe(true);
    });

    it('should return false for different valid addresses', () => {
      const another = StellarSdk.Keypair.random().publicKey();
      const result = compareWalletAddresses(validAddress, another);
      expect(result).toBe(false);
    });

    it('should return false when first address is invalid', () => {
      const result = compareWalletAddresses('INVALID', validAddress);
      expect(result).toBe(false);
    });

    it('should return false when second address is invalid', () => {
      const result = compareWalletAddresses(validAddress, 'INVALID');
      expect(result).toBe(false);
    });

    it('should return false when both addresses are invalid', () => {
      const result = compareWalletAddresses('INVALID1', 'INVALID2');
      expect(result).toBe(false);
    });

    it('should return false for empty strings', () => {
      const result = compareWalletAddresses('', '');
      expect(result).toBe(false);
    });

    it('should return false for whitespace-only strings', () => {
      const result = compareWalletAddresses('   ', '  ');
      expect(result).toBe(false);
    });

    it('should not throw exceptions for invalid input', () => {
      expect(() =>
        compareWalletAddresses(null as any, validAddress),
      ).not.toThrow();
      expect(compareWalletAddresses(null as any, validAddress)).toBe(false);
    });
  });

  describe('isValidWalletAddress', () => {
    it('should return true for valid uppercase address', () => {
      const result = isValidWalletAddress(validAddressUppercase);
      expect(result).toBe(true);
    });

    it('should return true for valid lowercase address', () => {
      const result = isValidWalletAddress(validAddressLowercase);
      expect(result).toBe(true);
    });

    it('should return true for valid address with whitespace', () => {
      const result = isValidWalletAddress(`  ${validAddress}  `);
      expect(result).toBe(true);
    });

    it('should return false for invalid format', () => {
      const result = isValidWalletAddress('INVALID');
      expect(result).toBe(false);
    });

    it('should return false for empty string', () => {
      const result = isValidWalletAddress('');
      expect(result).toBe(false);
    });

    it('should return false for null', () => {
      const result = isValidWalletAddress(null as any);
      expect(result).toBe(false);
    });

    it('should return false for undefined', () => {
      const result = isValidWalletAddress(undefined as any);
      expect(result).toBe(false);
    });

    it('should return false for corrupted checksum', () => {
      const corruptedAddress = validAddress.substring(0, 55) + 'X';
      const result = isValidWalletAddress(corruptedAddress);
      expect(result).toBe(false);
    });

    it('should return false for wrong length', () => {
      const result = isValidWalletAddress(validAddress + 'X');
      expect(result).toBe(false);
    });

    it('should not throw exceptions', () => {
      expect(() => isValidWalletAddress(null as any)).not.toThrow();
      expect(() => isValidWalletAddress(undefined as any)).not.toThrow();
      expect(() => isValidWalletAddress(123 as any)).not.toThrow();
    });
  });

  describe('Edge cases and integration', () => {
    it('should handle rapid sequential calls', () => {
      for (let i = 0; i < 100; i++) {
        const keypair = StellarSdk.Keypair.random();
        const normalized = normalizeWalletAddress(keypair.publicKey());
        expect(isValidWalletAddress(normalized)).toBe(true);
      }
    });

    it('should maintain consistency across multiple normalizations', () => {
      const once = normalizeWalletAddress(validAddress);
      const twice = normalizeWalletAddress(once);
      const thrice = normalizeWalletAddress(twice);
      expect(once).toBe(twice);
      expect(twice).toBe(thrice);
    });

    it('should work with database storage scenarios', () => {
      const addresses = [
        validAddressUppercase,
        `  ${validAddressLowercase}  `,
        validAddress,
      ];
      const normalized = addresses.map(normalizeWalletAddress);
      const allEqual = normalized.every((addr) => addr === normalized[0]);
      expect(allEqual).toBe(true);
    });
  });
});
