import { WalletStrategy } from './wallet.strategy';
import { Account, Keypair, MuxedAccount } from '@stellar/stellar-sdk';

describe('WalletStrategy (#1314)', () => {
  let strategy: WalletStrategy;
  let keypair: Keypair;
  /** `keypair.publicKey` is a method in @stellar/stellar-sdk 17. */
  let address: string;

  /** A SEP-23 muxed address (M...) for the same underlying account. */
  const muxedAddress = (): string =>
    new MuxedAccount(new Account(address, '0'), '1234').accountId();

  beforeEach(() => {
    strategy = new WalletStrategy();
    keypair = Keypair.random();
    address = keypair.publicKey();
  });

  const nonce = 'f'.repeat(64);

  describe('isValidAddress()', () => {
    it('accepts a classic G account', () => {
      expect(strategy.isValidAddress(address)).toBe(true);
    });

    it('is case insensitive and tolerates surrounding whitespace', () => {
      expect(strategy.isValidAddress(address.toLowerCase())).toBe(true);
      expect(strategy.isValidAddress(`  ${address}  `)).toBe(true);
    });

    it('accepts a SEP-23 muxed (M) account', () => {
      const muxed = muxedAddress();

      expect(muxed.startsWith('M')).toBe(true);
      expect(strategy.isValidAddress(muxed)).toBe(true);
    });

    it('rejects anything that is not a Stellar address', () => {
      expect(strategy.isValidAddress(undefined)).toBe(false);
      expect(strategy.isValidAddress(null)).toBe(false);
      expect(strategy.isValidAddress('')).toBe(false);
      expect(strategy.isValidAddress('  ')).toBe(false);
      expect(strategy.isValidAddress('G')).toBe(false);
      expect(strategy.isValidAddress('user@example.com')).toBe(false);
      expect(strategy.isValidAddress(address.slice(0, 55))).toBe(false);
      // Secret key material must never be accepted as an account address.
      expect(strategy.isValidAddress(keypair.secret())).toBe(false);
    });
  });

  describe('resolveKeypair()', () => {
    it('resolves a G address to its keypair', () => {
      expect(strategy.resolveKeypair(address)?.publicKey()).toBe(address);
    });

    it('resolves a muxed M address to the underlying Ed25519 account', () => {
      expect(strategy.resolveKeypair(muxedAddress())?.publicKey()).toBe(address);
    });

    it('returns null instead of throwing on a bad address', () => {
      expect(strategy.resolveKeypair('nope')).toBeNull();
      expect(strategy.resolveKeypair(undefined)).toBeNull();
    });
  });

  describe('verifySignature()', () => {
    it('accepts a base64 signature over the nonce', () => {
      const signature = Buffer.from(keypair.sign(Buffer.from(nonce, 'utf8'))).toString('base64');

      expect(strategy.verifySignature(address, nonce, signature)).toBe(true);
    });

    it('accepts a hex encoded signature', () => {
      const signature = Buffer.from(keypair.sign(Buffer.from(nonce, 'utf8'))).toString('hex');

      expect(strategy.verifySignature(address, nonce, signature)).toBe(true);
    });

    it('verifies a signature made from a muxed address', () => {
      const signature = Buffer.from(keypair.sign(Buffer.from(nonce, 'utf8'))).toString('base64');

      expect(strategy.verifySignature(muxedAddress(), nonce, signature)).toBe(true);
    });

    it('rejects a signature over a different nonce', () => {
      const signature = Buffer.from(keypair.sign(Buffer.from('other-nonce'))).toString('base64');

      expect(strategy.verifySignature(address, nonce, signature)).toBe(false);
    });

    it('rejects a signature from a different key', () => {
      const attacker = Keypair.random();
      const signature = Buffer.from(attacker.sign(Buffer.from(nonce, 'utf8'))).toString('base64');

      expect(strategy.verifySignature(address, nonce, signature)).toBe(false);
    });

    it('rejects a signature of the wrong length', () => {
      const signature = Buffer.from(keypair.sign(Buffer.from(nonce, 'utf8')));

      expect(
        strategy.verifySignature(address, nonce, signature.subarray(0, 32).toString('base64')),
      ).toBe(false);
    });

    it('rejects an undecodable or empty signature', () => {
      expect(strategy.verifySignature(address, nonce, '!!!not base64!!!')).toBe(false);
      expect(strategy.verifySignature(address, nonce, '')).toBe(false);
      expect(strategy.verifySignature(address, '', 'AAAA')).toBe(false);
      expect(strategy.verifySignature('invalid', nonce, 'AAAA')).toBe(false);
    });
  });

  describe('normalize()', () => {
    it('upper cases and trims, matching Stellar encoding', () => {
      expect(WalletStrategy.normalize(` ${address.toLowerCase()} `)).toBe(address);
    });
  });
});
