import { UnauthorizedException } from '@nestjs/common';
import { SignatureService } from './signature.service';
import type { WalletStrategy } from './strategies/wallet.strategy';

const WALLET = 'G' + 'A'.repeat(55);

function createService() {
  const verify = jest.fn();
  const service = new SignatureService({ verify } as unknown as WalletStrategy);
  return { service, verify };
}

describe('SignatureService', () => {
  it('delegates to the wallet strategy with the wallet, nonce and signature', () => {
    const { service, verify } = createService();

    service.verify(WALLET, 'nonce-1', 'sig-1');

    expect(verify).toHaveBeenCalledWith(WALLET, 'nonce-1', 'sig-1');
  });

  it('returns void on success', () => {
    const { service } = createService();
    expect(service.verify(WALLET, 'nonce-1', 'sig-1')).toBeUndefined();
  });

  it('propagates the strategy error unchanged', () => {
    const { service, verify } = createService();
    verify.mockImplementation(() => {
      throw new UnauthorizedException('Invalid signature');
    });

    expect(() => service.verify(WALLET, 'nonce-1', 'bad')).toThrow(UnauthorizedException);
    expect(() => service.verify(WALLET, 'nonce-1', 'bad')).toThrow('Invalid signature');
  });

  it('does not swallow a signature failure', () => {
    const { service, verify } = createService();
    verify.mockImplementation(() => {
      throw new Error('signature verification failed');
    });

    expect(() => service.verify(WALLET, 'nonce-1', 'bad')).toThrow('signature verification failed');
  });

  it('calls the strategy exactly once per verification', () => {
    const { service, verify } = createService();
    service.verify(WALLET, 'nonce-1', 'sig-1');
    expect(verify).toHaveBeenCalledTimes(1);
  });
});