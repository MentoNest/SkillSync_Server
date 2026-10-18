import { UnauthorizedException } from '@nestjs/common';
import { Keypair } from '@stellar/stellar-sdk';
import { buildLoginMessage } from '../nonce.service';
import { WalletStrategy } from './wallet.strategy';

describe('WalletStrategy', () => {
  const strategy = new WalletStrategy();
  const keypair = Keypair.random();
  const nonce = 'n'.repeat(64);

  const sign = (key: Keypair, wallet: string, n: string): string =>
    key.sign(Buffer.from(buildLoginMessage(wallet, n), 'utf8')).toString('base64');

  it('accepts a valid signature for the wallet', () => {
    expect(() =>
      strategy.verify(keypair.publicKey(), nonce, sign(keypair, keypair.publicKey(), nonce)),
    ).not.toThrow();
  });

  it('accepts a lowercase wallet address', () => {
    expect(() =>
      strategy.verify(keypair.publicKey().toLowerCase(), nonce, sign(keypair, keypair.publicKey(), nonce)),
    ).not.toThrow();
  });

  it('rejects an invalid wallet address', () => {
    expect(() => strategy.verify('not-a-wallet', nonce, 'c2ln')).toThrow(UnauthorizedException);
    expect(() => strategy.verify('not-a-wallet', nonce, 'c2ln')).toThrow('Invalid wallet address');
  });

  it('rejects a signature made by another key', () => {
    const other = Keypair.random();
    expect(() =>
      strategy.verify(keypair.publicKey(), nonce, sign(other, keypair.publicKey(), nonce)),
    ).toThrow('Invalid signature');
  });

  it('rejects a signature over a different nonce', () => {
    expect(() =>
      strategy.verify(keypair.publicKey(), nonce, sign(keypair, keypair.publicKey(), 'other')),
    ).toThrow('Invalid signature');
  });

  it('rejects a malformed signature payload', () => {
    expect(() => strategy.verify(keypair.publicKey(), nonce, '!!!not-base64!!!')).toThrow(
      'Invalid signature',
    );
  });
});
