import { Test } from '@nestjs/testing';
import { BadRequestException } from '@nestjs/common';
import * as crypto from 'crypto';
import { NonceService } from './nonce.service';
import { RedisService } from './redis.service';
import { WalletStrategy } from '../strategies/wallet.strategy';
import { resetAuthTokenConfig } from '../config/auth-token.config';

describe('NonceService (#1313)', () => {
  const WALLET = 'GA7QYNF7SOWQ3GLR2BGMZEHXAVIRZA4KVWLTJJFC7MGXUA74P7UJVSGZ';
  let service: NonceService;
  let redis: { set: any; getdel: any; get: any; del: any };

  beforeEach(async () => {
    resetAuthTokenConfig();
    delete process.env.NONCE_TTL_SECONDS;

    redis = {
      set: vi.fn().mockResolvedValue(undefined),
      getdel: vi.fn().mockResolvedValue(null),
      get: vi.fn().mockResolvedValue(null),
      del: vi.fn().mockResolvedValue(undefined),
    };

    const module = await Test.createTestingModule({
      providers: [
        NonceService,
        WalletStrategy,
        { provide: RedisService, useValue: redis },
      ],
    }).compile();

    service = module.get(NonceService);
  });

  afterEach(() => {
    resetAuthTokenConfig();
    delete process.env.NONCE_TTL_SECONDS;
  });

  describe('keyFor()', () => {
    it('uses the nonce:{walletAddress} pattern, case insensitive', () => {
      expect(NonceService.keyFor(WALLET)).toBe(`nonce:${WALLET.toLowerCase()}`);
      expect(NonceService.keyFor(`  ${WALLET.toUpperCase()}  `)).toBe(
        `nonce:${WALLET.toLowerCase()}`,
      );
    });
  });

  describe('issue()', () => {
    it('returns a 256-bit hex nonce and a 5 minute expiry', async () => {
      const issued = await service.issue(WALLET);

      expect(issued.nonce).toMatch(/^[a-f0-9]{64}$/);
      expect(issued.walletAddress).toBe(WALLET.toLowerCase());
      expect(issued.expiresAt.getTime() - Date.now()).toBeGreaterThan(4 * 60 * 1000);
      expect(issued.expiresAt.getTime() - Date.now()).toBeLessThanOrEqual(5 * 60 * 1000);
    });

    it('stores the challenge in Redis with the documented key and TTL', async () => {
      await service.issue(WALLET);

      const [key, value, ttl] = redis.set.mock.calls[0];
      expect(key).toBe(`nonce:${WALLET.toLowerCase()}`);
      expect(ttl).toBe(300);
      expect(JSON.parse(value)).toMatchObject({
        nonce: expect.stringMatching(/^[a-f0-9]{64}$/),
        purpose: NonceService.PURPOSE_LOGIN,
      });
    });

    it('produces a different nonce on every call', async () => {
      const first = await service.issue(WALLET);
      const second = await service.issue(WALLET);

      expect(first.nonce).not.toBe(second.nonce);
    });

    it('overwrites a previous challenge for the same wallet', async () => {
      await service.issue(WALLET);
      await service.issue(WALLET);

      // Same key both times: the second SET evicts the first nonce.
      expect(redis.set.mock.calls[0][0]).toBe(redis.set.mock.calls[1][0]);
    });

    it('rejects an address that is not a Stellar public key', async () => {
      await expect(service.issue('not-a-wallet')).rejects.toBeInstanceOf(BadRequestException);
      await expect(service.issue('')).rejects.toBeInstanceOf(BadRequestException);
      expect(redis.set).not.toHaveBeenCalled();
    });

    it('honours NONCE_TTL_SECONDS', async () => {
      process.env.NONCE_TTL_SECONDS = '60';
      resetAuthTokenConfig();

      await service.issue(WALLET);

      expect(redis.set.mock.calls[0][2]).toBe(60);
      expect(service.ttlSeconds).toBe(60);
    });
  });

  describe('consume()', () => {
    const stored = (overrides: Record<string, unknown> = {}) =>
      JSON.stringify({
        nonce: 'a'.repeat(64),
        purpose: NonceService.PURPOSE_LOGIN,
        issuedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 60_000).toISOString(),
        ...overrides,
      });

    it('reads and deletes the challenge in one atomic call', async () => {
      redis.getdel.mockResolvedValueOnce(stored());

      const result = await service.consume(WALLET);

      expect(redis.getdel).toHaveBeenCalledWith(`nonce:${WALLET.toLowerCase()}`);
      expect(redis.get).not.toHaveBeenCalled();
      expect(result).toMatchObject({ status: 'ok' });
    });

    it('reports a missing challenge', async () => {
      redis.getdel.mockResolvedValueOnce(null);

      expect(await service.consume(WALLET)).toEqual({ status: 'missing' });
    });

    it('reports an expired challenge', async () => {
      redis.getdel.mockResolvedValueOnce(
        stored({ expiresAt: new Date(Date.now() - 1000).toISOString() }),
      );

      expect(await service.consume(WALLET)).toEqual({ status: 'expired' });
    });

    it('reports a corrupted payload', async () => {
      redis.getdel.mockResolvedValueOnce('{not json');

      expect(await service.consume(WALLET)).toEqual({ status: 'corrupted' });
    });

    it('reports a payload with no nonce as corrupted', async () => {
      redis.getdel.mockResolvedValueOnce(JSON.stringify({ expiresAt: new Date().toISOString() }));

      expect(await service.consume(WALLET)).toEqual({ status: 'corrupted' });
    });

    it('reports a payload with an unparsable timestamp as corrupted', async () => {
      redis.getdel.mockResolvedValueOnce(JSON.stringify({ nonce: 'x', expiresAt: 'nope' }));

      expect(await service.consume(WALLET)).toEqual({ status: 'corrupted' });
    });

    it('a challenge can only be consumed once', async () => {
      redis.getdel.mockResolvedValueOnce(stored()).mockResolvedValueOnce(null);

      expect((await service.consume(WALLET)).status).toBe('ok');
      expect((await service.consume(WALLET)).status).toBe('missing');
    });
  });

  describe('matches()', () => {
    it('accepts the issued nonce', () => {
      expect(NonceService.matches('abc123', 'abc123')).toBe(true);
    });

    it('rejects a different, longer, shorter or missing nonce', () => {
      expect(NonceService.matches('abc123', 'abc124')).toBe(false);
      expect(NonceService.matches('abc123', 'abc1234')).toBe(false);
      expect(NonceService.matches('abc123', 'abc12')).toBe(false);
      expect(NonceService.matches('abc123', undefined)).toBe(false);
      expect(NonceService.matches('abc123', null)).toBe(false);
      expect(NonceService.matches('abc123', '')).toBe(false);
    });

    it('does not throw on inputs of different lengths, unlike raw timingSafeEqual', () => {
      expect(() => crypto.timingSafeEqual(Buffer.from('a'), Buffer.from('bb'))).toThrow();
      expect(() => NonceService.matches('a', 'bb')).not.toThrow();
    });
  });

  describe('revoke()', () => {
    it('drops the challenge', async () => {
      await service.revoke(WALLET);

      expect(redis.del).toHaveBeenCalledWith(`nonce:${WALLET.toLowerCase()}`);
    });
  });
});
