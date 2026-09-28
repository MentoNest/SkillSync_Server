import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import { UnauthorizedException } from '@nestjs/common';
import { generateKeyPairSync } from 'crypto';
import { AccessTokenService } from './access-token.service';
import { User, UserStatus } from '../../user/entities/user.entity';
import { Role } from '../../entities/role.entity';
import {
  assertSigningMaterial,
  getAuthTokenConfig,
  loadAuthTokenConfig,
  parseDurationToSeconds,
  resetAuthTokenConfig,
} from '../config/auth-token.config';

describe('access tokens (#1315)', () => {
  const ORIGINAL_ENV = { ...process.env };
  let service: AccessTokenService;
  let jwt: JwtService;
  const rs256 = generateKeyPairSync('rsa', {
    modulusLength: 2048,
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
    publicKeyEncoding: { type: 'spki', format: 'pem' },
  });

  const user = (overrides: Partial<User> = {}): User =>
    ({
      id: 'user-1',
      email: 'user@example.com',
      walletAddress: 'gwallet',
      tokenVersion: 3,
      status: UserStatus.ACTIVE,
      roles: [Object.assign(new Role(), { name: 'mentor' })],
      ...overrides,
    }) as User;

  beforeEach(async () => {
    process.env = {
      ...ORIGINAL_ENV,
      JWT_SECRET: 'test-secret-at-least-long-enough-for-hs256',
      JWT_ALGORITHM: 'HS256',
      JWT_ISSUER: 'skillsync',
      JWT_AUDIENCE: 'skillsync-api',
      JWT_ACCESS_EXPIRATION: '15m',
    };
    resetAuthTokenConfig();

    jwt = new JwtService({});
    const module = await Test.createTestingModule({
      providers: [AccessTokenService, { provide: JwtService, useValue: jwt }],
    }).compile();

    service = module.get(AccessTokenService);
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    resetAuthTokenConfig();
  });

  describe('parseDurationToSeconds()', () => {
    it('understands bare seconds, s, m, h and d', () => {
      expect(parseDurationToSeconds('900', 60)).toBe(900);
      expect(parseDurationToSeconds('90s', 60)).toBe(90);
      expect(parseDurationToSeconds('15m', 60)).toBe(900);
      expect(parseDurationToSeconds('2h', 60)).toBe(7200);
      expect(parseDurationToSeconds('7d', 60)).toBe(604_800);
      expect(parseDurationToSeconds('1.5h', 60)).toBe(5400);
    });

    it('falls back for missing or unparsable values', () => {
      expect(parseDurationToSeconds(undefined, 42)).toBe(42);
      expect(parseDurationToSeconds('', 42)).toBe(42);
      expect(parseDurationToSeconds('   ', 42)).toBe(42);
      expect(parseDurationToSeconds('tomorrow', 42)).toBe(42);
    });

    it('never returns less than one second for sub-second values', () => {
      expect(parseDurationToSeconds('500ms', 60)).toBe(1);
    });
  });

  describe('loadAuthTokenConfig()', () => {
    it('defaults to HS256, 15m access tokens and a 30 day refresh window', () => {
      const config = loadAuthTokenConfig();

      expect(config.algorithm).toBe('HS256');
      expect(config.accessExpiresIn).toBe(900);
      expect(config.refreshExpirationDays).toBe(30);
      expect(config.nonceTtlSeconds).toBe(300);
      expect(config.nonceRateLimitMax).toBe(5);
      expect(config.walletLoginRateLimitMax).toBe(10);
      expect(config.walletLoginRateLimitWindowSeconds).toBe(900);
      expect(config.refreshReuseAlert).toBe(true);
    });

    it('reads the environment and clamps hostile values', () => {
      process.env.JWT_ALGORITHM = 'RS256';
      process.env.JWT_PRIVATE_KEY = rs256.privateKey;
      process.env.JWT_ACCESS_EXPIRATION = '1h';
      process.env.JWT_REFRESH_EXPIRATION_DAYS = '9999';
      process.env.NONCE_RATE_LIMIT_MAX = '-4';

      const config = loadAuthTokenConfig();

      expect(config.algorithm).toBe('RS256');
      expect(config.accessExpiresIn).toBe(3600);
      expect(config.refreshExpirationDays).toBe(365);
      expect(config.nonceRateLimitMax).toBe(1);
    });

    it('accepts PEM keys written with escaped newlines', () => {
      process.env.JWT_PRIVATE_KEY = rs256.privateKey.replace(/\n/g, '\\n');
      resetAuthTokenConfig();

      expect(getAuthTokenConfig().privateKey).toContain('PRIVATE KEY');
    });

    it('falls back to HS256 for an unknown algorithm', () => {
      process.env.JWT_ALGORITHM = 'none';
      expect(loadAuthTokenConfig().algorithm).toBe('HS256');
    });
  });

  describe('assertSigningMaterial()', () => {
    it('rejects RS256 without a private key instead of silently downgrading', () => {
      process.env.JWT_ALGORITHM = 'RS256';
      delete process.env.JWT_PRIVATE_KEY;
      resetAuthTokenConfig();

      expect(() => assertSigningMaterial(getAuthTokenConfig())).toThrow(/JWT_PRIVATE_KEY/);
    });

    it('accepts RS256 with a key', () => {
      process.env.JWT_ALGORITHM = 'RS256';
      process.env.JWT_PRIVATE_KEY = rs256.privateKey;
      resetAuthTokenConfig();

      expect(() => assertSigningMaterial(getAuthTokenConfig())).not.toThrow();
    });
  });

  describe('resolvePermissions()', () => {
    it('maps roles to their built-in permissions', () => {
      expect(AccessTokenService.resolvePermissions(user())).toEqual(
        expect.arrayContaining(['profile:read', 'session:update', 'review:create']),
      );
    });

    it('gives admin the wildcard', () => {
      const admin = user({ roles: [Object.assign(new Role(), { name: 'admin' })] });

      expect(AccessTokenService.resolvePermissions(admin)).toContain('*');
    });

    it('merges permissions stored on the role row', () => {
      const custom = Object.assign(new Role(), { name: 'mentee', permissions: ['audit:read'] });

      expect(AccessTokenService.resolvePermissions(user({ roles: [custom] }))).toEqual(
        expect.arrayContaining(['audit:read', 'profile:read']),
      );
    });

    it('is empty for a user without roles', () => {
      expect(AccessTokenService.resolvePermissions(user({ roles: [] }))).toEqual([]);
    });
  });

  describe('issueAccessToken()', () => {
    it('carries the core claims required by the ticket', () => {
      const issued = service.issueAccessToken(user());
      const claims = service.verify(issued.token, 'access')!;

      expect(claims).toMatchObject({
        sub: 'user-1',
        wallet: 'gwallet',
        roles: ['mentor'],
        tokenVersion: 3,
        typ: 'access',
      });
      expect(claims.permissions).toContain('session:update');
      expect(claims.jti).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('adds the standard claim set', () => {
      const issued = service.issueAccessToken(user());
      const claims: any = service.verify(issued.token, 'access');

      expect(claims.iss).toBe('skillsync');
      expect(claims.aud).toBe('skillsync-api');
      expect(typeof claims.iat).toBe('number');
      expect(claims.exp).toBeGreaterThan(claims.iat);
      expect(issued.expiresIn).toBe(900);
    });

    it('expiry is configurable and reported back to the client', () => {
      process.env.JWT_ACCESS_EXPIRATION = '30m';
      resetAuthTokenConfig();

      expect(service.issueAccessToken(user()).expiresIn).toBe(1800);
    });

    it('honours the lifetime encoded in the token', () => {
      process.env.JWT_ACCESS_EXPIRATION = '2m';
      resetAuthTokenConfig();

      const issued = service.issueAccessToken(user());
      const claims: any = service.verify(issued.token, 'access');

      expect(claims.exp - claims.iat).toBe(120);
    });

    it('issues a distinct jti per token', () => {
      const first: any = service.verify(service.issueAccessToken(user()).token, 'access');
      const second: any = service.verify(service.issueAccessToken(user()).token, 'access');

      expect(first.jti).not.toBe(second.jti);
    });

    it('signs with RS256 when configured', () => {
      process.env.JWT_ALGORITHM = 'RS256';
      process.env.JWT_PRIVATE_KEY = rs256.privateKey;
      process.env.JWT_PUBLIC_KEY = rs256.publicKey;
      resetAuthTokenConfig();

      const issued = service.issueAccessToken(user());
      const [header] = issued.token.split('.');
      expect(JSON.parse(Buffer.from(header, 'base64url').toString()).alg).toBe('RS256');
    });

    it('refuses to mint a token when RS256 is misconfigured', () => {
      process.env.JWT_ALGORITHM = 'RS256';
      delete process.env.JWT_PRIVATE_KEY;
      resetAuthTokenConfig();

      expect(() => service.issueAccessToken(user())).toThrow(/JWT_PRIVATE_KEY/);
    });
  });

  describe('issueRefreshToken()', () => {
    it('carries the same core claims as the access token, typed as a refresh', () => {
      const access: any = service.verify(service.issueAccessToken(user()).token, 'access');
      const refresh: any = service.verify(service.issueRefreshToken(user()).token, 'refresh');

      expect(refresh.typ).toBe('refresh');
      for (const claim of ['sub', 'wallet', 'roles', 'permissions', 'tokenVersion']) {
        expect(refresh[claim]).toEqual(access[claim]);
      }
      // Same core claims, but every token gets its own id.
      expect(refresh.jti).toMatch(/^[0-9a-f-]{36}$/);
      expect(refresh.jti).not.toBe(access.jti);
    });

    it('lives for the configured refresh window', () => {
      const issued = service.issueRefreshToken(user());

      expect(issued.expiresIn).toBe(30 * 24 * 3600);
    });
  });

  describe('verify()', () => {
    it('rejects a refresh token presented as an access token and vice versa', () => {
      const accessToken = service.issueAccessToken(user()).token;
      const refreshToken = service.issueRefreshToken(user()).token;

      expect(service.verify(accessToken, 'refresh')).toBeNull();
      expect(service.verify(refreshToken, 'access')).toBeNull();
    });

    it('rejects a tampered token', () => {
      const token = service.issueAccessToken(user()).token;
      const tampered = `${token.slice(0, -3)}abc`;

      expect(service.verify(tampered, 'access')).toBeNull();
    });

    it('rejects a token signed with another secret', () => {
      const token = service.issueAccessToken(user()).token;
      process.env.JWT_SECRET = 'a-completely-different-secret-value';
      resetAuthTokenConfig();

      expect(service.verify(token, 'access')).toBeNull();
    });

    it('rejects a token minted for another audience or issuer', () => {
      const token = service.issueAccessToken(user()).token;

      process.env.JWT_AUDIENCE = 'another-api';
      resetAuthTokenConfig();
      expect(service.verify(token, 'access')).toBeNull();

      process.env.JWT_AUDIENCE = 'skillsync-api';
      process.env.JWT_ISSUER = 'someone-else';
      resetAuthTokenConfig();
      expect(service.verify(token, 'access')).toBeNull();
    });

    it('rejects an expired token', () => {
      process.env.JWT_ACCESS_EXPIRATION = '1s';
      resetAuthTokenConfig();
      const token = service.issueAccessToken(user()).token;

      return new Promise<void>((resolve) => {
        setTimeout(() => {
          expect(service.verify(token, 'access')).toBeNull();
          resolve();
        }, 1100);
      });
    });

    it('rejects garbage without throwing', () => {
      expect(service.verify('not.a.jwt', 'access')).toBeNull();
      expect(service.verify('', 'access')).toBeNull();
    });
  });

  describe('verifyOrReject()', () => {
    it('returns the claims when valid', () => {
      const issued = service.issueAccessToken(user());

      expect(service.verifyOrReject(issued.token, 'access', 'nope').sub).toBe('user-1');
    });

    it('throws a 401 with the supplied message otherwise', () => {
      expect(() => service.verifyOrReject('rubbish', 'access', 'Bad token')).toThrow(
        UnauthorizedException,
      );
    });
  });

  describe('isStaleByVersion()', () => {
    it('detects a token issued before a role change', () => {
      expect(AccessTokenService.isStaleByVersion({ tokenVersion: 2 }, 3)).toBe(true);
      expect(AccessTokenService.isStaleByVersion({ tokenVersion: 3 }, 3)).toBe(false);
      expect(AccessTokenService.isStaleByVersion({}, 0)).toBe(false);
    });
  });

  describe('hasPermission()', () => {
    it('honours the wildcard and resource wildcards', () => {
      expect(AccessTokenService.hasPermission({ permissions: ['*'] }, 'user:delete')).toBe(true);
      expect(AccessTokenService.hasPermission({ permissions: ['session:*'] }, 'session:update')).toBe(
        true,
      );
      expect(AccessTokenService.hasPermission({ permissions: ['session:*'] }, 'user:delete')).toBe(
        false,
      );
      expect(AccessTokenService.hasPermission({ permissions: ['profile:read'] }, 'profile:update')).toBe(
        false,
      );
      expect(AccessTokenService.hasPermission({}, 'profile:read')).toBe(false);
    });
  });
});
