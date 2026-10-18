import { UnauthorizedException } from '@nestjs/common';
import { buildLoginMessage, NONCE_TTL_SECONDS, NonceService } from './nonce.service';

const WALLET = 'G' + 'A'.repeat(55);

function createService() {
  const redis = { set: jest.fn(), getdel: jest.fn() };
  const service = new NonceService(redis as never);
  return { service, redis };
}

describe('NonceService', () => {
  it('builds the exact login message a wallet must sign', () => {
    expect(buildLoginMessage(WALLET, 'abc')).toBe(
      `SkillSync login\nWallet: ${WALLET}\nNonce: abc`,
    );
  });

  it('issues an uppercase-keyed nonce with a TTL', async () => {
    const { service, redis } = createService();
    redis.set.mockResolvedValue('OK');
    const result = await service.issue(WALLET.toLowerCase());
    expect(redis.set).toHaveBeenCalledWith(
      `auth:nonce:${WALLET}`,
      expect.any(String),
      'EX',
      NONCE_TTL_SECONDS,
    );
    expect(result.nonce).toMatch(/^[0-9a-f]{64}$/);
    expect(result.message).toContain(WALLET);
    expect(result.message).toContain(result.nonce);
    expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('consumes a matching nonce exactly once', async () => {
    const { service, redis } = createService();
    redis.getdel.mockResolvedValue('stored');
    await expect(service.consume(WALLET, 'stored')).resolves.toBeUndefined();
    expect(redis.getdel).toHaveBeenCalledWith(`auth:nonce:${WALLET}`);
  });

  it('rejects a missing nonce', async () => {
    const { service, redis } = createService();
    redis.getdel.mockResolvedValue(null);
    await expect(service.consume(WALLET, 'stored')).rejects.toThrow(UnauthorizedException);
  });

  it('rejects a mismatched nonce', async () => {
    const { service, redis } = createService();
    redis.getdel.mockResolvedValue('other');
    await expect(service.consume(WALLET, 'stored')).rejects.toThrow('Invalid or expired nonce');
  });
});
