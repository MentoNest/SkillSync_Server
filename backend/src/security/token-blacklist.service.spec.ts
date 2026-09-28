import { Test } from '@nestjs/testing';
import * as crypto from 'crypto';
import { TokenBlacklistService } from './token-blacklist.service';
import { RedisService } from '../services/redis.service';

describe('TokenBlacklistService (#1317)', () => {
  let service: TokenBlacklistService;
  let redis: { blacklistToken: ReturnType<typeof vi.fn>; isTokenBlacklisted: ReturnType<typeof vi.fn> };

  const encode = (payload: Record<string, unknown>) =>
    `header.${Buffer.from(JSON.stringify(payload)).toString('base64url')}.signature`;

  const futureToken = (seconds: number) =>
    encode({ sub: 'user-1', exp: Math.floor(Date.now() / 1000) + seconds });

  beforeEach(async () => {
    redis = {
      blacklistToken: vi.fn().mockResolvedValue(undefined),
      isTokenBlacklisted: vi.fn().mockResolvedValue(false),
    };

    const module = await Test.createTestingModule({
      providers: [TokenBlacklistService, { provide: RedisService, useValue: redis }],
    }).compile();

    service = module.get(TokenBlacklistService);
  });

  describe('extractBearerToken()', () => {
    it('accepts a well formed header, case-insensitively', () => {
      expect(TokenBlacklistService.extractBearerToken('Bearer abc.def.ghi')).toBe('abc.def.ghi');
      expect(TokenBlacklistService.extractBearerToken('bearer abc.def.ghi')).toBe('abc.def.ghi');
    });

    it('rejects anything that is not a bearer credential', () => {
      expect(TokenBlacklistService.extractBearerToken(undefined)).toBeNull();
      expect(TokenBlacklistService.extractBearerToken('')).toBeNull();
      expect(TokenBlacklistService.extractBearerToken('Basic dXNlcjpwYXNz')).toBeNull();
      expect(TokenBlacklistService.extractBearerToken('Bearer')).toBeNull();
      expect(TokenBlacklistService.extractBearerToken('Bearer   ')).toBeNull();
    });
  });

  describe('digestFor()', () => {
    it('is a stable SHA-256 digest, so the raw token is never used as a key', () => {
      const token = futureToken(60);
      const digest = TokenBlacklistService.digestFor(token);

      expect(digest).toBe(crypto.createHash('sha256').update(token).digest('hex'));
      expect(digest).toHaveLength(64);
      expect(digest).not.toContain('.');
      expect(TokenBlacklistService.digestFor(token)).toBe(digest);
    });

    it('produces different digests for different tokens', () => {
      expect(TokenBlacklistService.digestFor(futureToken(60))).not.toBe(
        TokenBlacklistService.digestFor(futureToken(61)),
      );
    });
  });

  describe('ttlUntilExpiration()', () => {
    it('returns the remaining lifetime of the token', () => {
      const ttl = service.ttlUntilExpiration(futureToken(600));
      expect(ttl).toBeGreaterThan(500);
      expect(ttl).toBeLessThanOrEqual(600);
    });

    it('keeps a floor of one second for already expired tokens', () => {
      expect(service.ttlUntilExpiration(encode({ exp: 1 }))).toBe(1);
    });

    it('falls back to 24h for unparsable tokens', () => {
      expect(service.ttlUntilExpiration('not-a-jwt')).toBe(86_400);
      expect(service.ttlUntilExpiration(encode({ sub: 'no-exp' }))).toBe(86_400);
    });

    it('honours a custom fallback', () => {
      expect(service.ttlUntilExpiration('not-a-jwt', 60)).toBe(60);
    });
  });

  describe('readExpiration()', () => {
    it('returns null for structurally invalid tokens', () => {
      expect(TokenBlacklistService.readExpiration('nonsense')).toBeNull();
      expect(TokenBlacklistService.readExpiration('only.two')).toBeNull();
    });

    it('decodes the exp claim', () => {
      expect(TokenBlacklistService.readExpiration(encode({ exp: 1_700_000_000 }))).toBe(
        1_700_000_000_000,
      );
    });
  });

  describe('blacklistToken()', () => {
    it('stores the digest with a TTL matching the token lifetime', async () => {
      const ttl = await service.blacklistToken(futureToken(300));

      expect(redis.blacklistToken).toHaveBeenCalledWith(
        expect.stringMatching(/^[a-f0-9]{64}$/),
        ttl,
      );
      expect(ttl).toBeGreaterThan(0);
    });

    it('is a no-op without a token', async () => {
      expect(await service.blacklistToken(null)).toBeNull();
      expect(await service.blacklistToken('')).toBeNull();
      expect(redis.blacklistToken).not.toHaveBeenCalled();
    });

    it('accepts an explicit TTL', async () => {
      expect(await service.blacklistToken('opaque.token.value', 42)).toBe(42);
    });

    it('reports failure instead of pretending the token was revoked', async () => {
      redis.blacklistToken.mockRejectedValueOnce(new Error('redis down'));

      await expect(service.blacklistToken(futureToken(60))).resolves.toBeNull();
    });
  });

  describe('isTokenBlacklisted()', () => {
    it('looks the digest up', async () => {
      redis.isTokenBlacklisted.mockResolvedValueOnce(true);

      await expect(service.isTokenBlacklisted('raw.token.value')).resolves.toBe(true);
      expect(redis.isTokenBlacklisted).toHaveBeenCalledWith(
        crypto.createHash('sha256').update('raw.token.value').digest('hex'),
      );
    });

    it('is false without a token', async () => {
      expect(await service.isTokenBlacklisted(null)).toBe(false);
      expect(redis.isTokenBlacklisted).not.toHaveBeenCalled();
    });

    it('fails open when Redis is unreachable, so the JWT guard still validates', async () => {
      redis.isTokenBlacklisted.mockRejectedValueOnce(new Error('redis down'));

      await expect(service.isTokenBlacklisted('raw.token.value')).resolves.toBe(false);
    });
  });
});
