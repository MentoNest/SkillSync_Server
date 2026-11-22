import { BadRequestException } from '@nestjs/common';
import { normalizeWalletAddress } from './wallet.utils';

const WALLET = 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37';

describe('normalizeWalletAddress', () => {
  it('trims whitespace and returns a lowercase canonical address', () => {
    expect(normalizeWalletAddress(` \t${WALLET}\n `)).toBe(WALLET.toLowerCase());
  });

  it('normalizes mixed-case addresses consistently', () => {
    const mixedCase = [...WALLET].map((character, index) =>
      index % 2 === 0 ? character.toLowerCase() : character,
    ).join('');

    expect(normalizeWalletAddress(mixedCase)).toBe(WALLET.toLowerCase());
  });

  it.each(['', 'not-a-wallet', `${WALLET.slice(0, -1)}A`])(
    'rejects invalid addresses with a clear bad-request error (%s)',
    (address) => {
      try {
        normalizeWalletAddress(address);
        throw new Error('Expected invalid address to be rejected');
      } catch (error) {
        expect(error).toBeInstanceOf(BadRequestException);
        expect((error as BadRequestException).message).toContain('Invalid Stellar wallet address');
      }
    },
  );
});
