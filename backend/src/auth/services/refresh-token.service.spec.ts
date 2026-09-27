import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { RefreshTokenService, deviceFingerprint } from './refresh-token.service';
import { AccessTokenService } from './access-token.service';
import { RefreshToken } from '../entities/refresh-token.entity';
import { User, UserStatus } from '../../user/entities/user.entity';
import { resetAuthTokenConfig } from '../config/auth-token.config';

describe('RefreshTokenService (#1316)', () => {
  const ORIGINAL_ENV = { ...process.env };
  let service: RefreshTokenService;
  let repository: any;
  let userRepository: any;
  let reuseEvents: any[];

  const user = {
    id: 'user-1',
    email: 'user@example.com',
    walletAddress: 'gwallet',
    tokenVersion: 0,
    status: UserStatus.ACTIVE,
    roles: [],
  } as unknown as User;

  const storedRow = (overrides: Partial<RefreshToken> = {}): RefreshToken =>
    ({
      id: 'row-1',
      token: 'stored-token',
      jti: 'jti-1',
      familyId: 'family-1',
      userId: 'user-1',
      deviceInfo: null,
      ipAddress: '10.0.0.1',
      userAgent: 'vitest',
      isRevoked: false,
      expiresAt: new Date(Date.now() + 60_000),
      usedAt: null,
      replacedById: null,
      revocationReason: null,
      user,
      ...overrides,
    }) as RefreshToken;

  beforeEach(async () => {
    process.env = {
      ...ORIGINAL_ENV,
      JWT_SECRET: 'test-secret-at-least-long-enough-for-hs256',
      JWT_ALGORITHM: 'HS256',
      JWT_ISSUER: 'skillsync',
      JWT_AUDIENCE: 'skillsync-api',
    };
    resetAuthTokenConfig();
    reuseEvents = [];

    let idCounter = 0;
    repository = {
      create: vi.fn((data: Partial<RefreshToken>) => ({ ...data })),
      save: vi.fn(async (row: Partial<RefreshToken>) => ({
        ...row,
        id: row.id ?? `row-${++idCounter}`,
      })),
      findOne: vi.fn().mockResolvedValue(null),
      find: vi.fn().mockResolvedValue([]),
      update: vi.fn().mockResolvedValue({ affected: 0 }),
      count: vi.fn().mockResolvedValue(0),
      delete: vi.fn().mockResolvedValue({ affected: 0 }),
      manager: { getRepository: vi.fn(() => userRepository) },
    };
    userRepository = {
      findOne: vi.fn().mockResolvedValue({ id: 'user-1', tokenVersion: 5 }),
      save: vi.fn(async (u: any) => u),
    };

    const module = await Test.createTestingModule({
      providers: [
        RefreshTokenService,
        { provide: getRepositoryToken(RefreshToken), useValue: repository },
        { provide: AccessTokenService, useValue: new AccessTokenService(new (require('@nestjs/jwt').JwtService)({})) },
      ],
    }).compile();

    service = module.get(RefreshTokenService);
    service.onReuseDetected = (event) => {
      reuseEvents.push(event);
    };
  });

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    resetAuthTokenConfig();
  });

  /** Signs a refresh token the service will accept. */
  async function issue(userToSign: User = user): Promise<{ row: any; token: string }> {
    return service.issueForLogin(userToSign, { ipAddress: '10.0.0.1', userAgent: 'vitest' });
  }

  describe('deviceFingerprint()', () => {
    it('is stable for the same user agent and IP prefix', () => {
      expect(deviceFingerprint('203.0.113.9', 'curl')).toBe(deviceFingerprint('203.0.113.9', 'curl'));
    });

    it('ignores a change in the last octet, so mobile clients are not flagged', () => {
      expect(deviceFingerprint('203.0.113.9', 'curl')).toBe(deviceFingerprint('203.0.113.200', 'curl'));
    });

    it('changes with the user agent or the network', () => {
      expect(deviceFingerprint('203.0.113.9', 'curl')).not.toBe(
        deviceFingerprint('203.0.113.9', 'firefox'),
      );
      expect(deviceFingerprint('203.0.113.9', 'curl')).not.toBe(
        deviceFingerprint('198.51.100.9', 'curl'),
      );
    });

    it('never returns the raw inputs', () => {
      expect(deviceFingerprint('10.0.0.1', 'secret-agent')).not.toContain('secret-agent');
      expect(deviceFingerprint('10.0.0.1', 'secret-agent')).toHaveLength(32);
    });
  });

  describe('issueForLogin()', () => {
    it('stores the token with its jti, family, device fingerprint and expiry', async () => {
      const { row, token } = await issue();

      expect(token).toBe(row.token);
      expect(row.jti).toMatch(/^[0-9a-f-]{36}$/);
      expect(row.familyId).toMatch(/^[0-9a-f-]{36}$/);
      expect(row.deviceInfo).toHaveLength(32);
      expect(row.isRevoked).toBe(false);
      expect(row.ipAddress).toBe('10.0.0.1');
      expect(row.userAgent).toBe('vitest');
      expect(row.expiresAt.getTime()).toBeGreaterThan(Date.now());
    });

    it('starts a new family per login', async () => {
      const first = await issue();
      const second = await issue();

      expect(first.row.familyId).not.toBe(second.row.familyId);
    });

    it('stores a verifiable refresh JWT, not an opaque string', async () => {
      const { token } = await issue();
      const payload = JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString());

      expect(payload.typ).toBe('refresh');
      expect(payload.sub).toBe('user-1');
    });
  });

  describe('rotate()', () => {
    it('returns a new access and refresh token', async () => {
      const { row, token } = await issue();
      repository.findOne.mockResolvedValue(storedRow({ token, familyId: row.familyId }));

      const outcome = await service.rotate(token, { ipAddress: '10.0.0.1', userAgent: 'vitest' });

      expect(outcome).not.toBeNull();
      expect(outcome!.result.accessToken.split('.')).toHaveLength(3);
      expect(outcome!.result.refreshToken).not.toBe(token);
      expect(outcome!.result.tokenType).toBe('Bearer');
      expect(outcome!.result.expiresIn).toBe(900);
      expect(outcome!.result.refreshExpiresIn).toBe(30 * 24 * 3600);
    });

    it('revokes the presented token and links it to its replacement', async () => {
      const { row, token } = await issue();
      repository.findOne.mockResolvedValue(storedRow({ token, familyId: row.familyId }));

      const outcome = await service.rotate(token, { ipAddress: '10.0.0.1' });

      expect(outcome!.consumed.isRevoked).toBe(true);
      expect(outcome!.consumed.revocationReason).toBe('rotated');
      expect(outcome!.consumed.usedAt).toBeInstanceOf(Date);
      expect(outcome!.consumed.replacedById).toBe(outcome!.issued.id);
    });

    it('keeps the rotation in the same family and the same user', async () => {
      const { row, token } = await issue();
      repository.findOne.mockResolvedValue(storedRow({ token, familyId: row.familyId }));

      const outcome = await service.rotate(token, { ipAddress: '10.0.0.1' });

      expect(outcome!.issued.familyId).toBe(row.familyId);
      expect(outcome!.issued.userId).toBe('user-1');
    });

    it('reports how often the family has been rotated', async () => {
      const { row, token } = await issue();
      repository.findOne.mockResolvedValue(storedRow({ token, familyId: row.familyId }));
      repository.count.mockResolvedValue(2);

      const outcome = await service.rotate(token, { ipAddress: '10.0.0.1' });

      expect(outcome!.result.rotationCount).toBe(3);
    });

    it('flags a refresh from a different device', async () => {
      const { row, token } = await issue();
      repository.findOne.mockResolvedValue(
        storedRow({ token, familyId: row.familyId, deviceInfo: deviceFingerprint('1.2.3.4', 'curl') }),
      );

      const outcome = await service.rotate(token, { ipAddress: '9.9.9.9', userAgent: 'firefox' });

      expect(outcome!.result.deviceChanged).toBe(true);
    });

    it('does not flag the same device', async () => {
      const { row, token } = await issue();
      repository.findOne.mockResolvedValue(
        storedRow({ token, familyId: row.familyId, deviceInfo: deviceFingerprint('10.0.0.1', 'vitest') }),
      );

      const outcome = await service.rotate(token, { ipAddress: '10.0.0.1', userAgent: 'vitest' });

      expect(outcome!.result.deviceChanged).toBe(false);
    });

    it('rejects an unknown token without touching the database', async () => {
      repository.findOne.mockResolvedValue(null);

      expect(await service.rotate('some.jwt.value', {})).toBeNull();
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('rejects a token that is not a refresh token', async () => {
      const accessTokenService = new AccessTokenService(new (require('@nestjs/jwt').JwtService)({}));
      const accessToken = accessTokenService.issueAccessToken(user).token;

      expect(await service.rotate(accessToken, {})).toBeNull();
    });

    it('rejects an expired token and marks it as expired', async () => {
      const { row, token } = await issue();
      const expired = storedRow({
        token,
        familyId: row.familyId,
        expiresAt: new Date(Date.now() - 1000),
      });
      repository.findOne.mockResolvedValue(expired);

      expect(await service.rotate(token, {})).toBeNull();
      expect(expired.isRevoked).toBe(true);
      expect(expired.revocationReason).toBe('expired');
    });

    it('rejects a token whose user has been deleted', async () => {
      const { row, token } = await issue();
      repository.findOne.mockResolvedValue(
        storedRow({ token, familyId: row.familyId, user: undefined as any }),
      );

      expect(await service.rotate(token, {})).toBeNull();
    });
  });

  describe('reuse detection (#1316 concurrent refresh)', () => {
    async function rotateOnce(): Promise<string> {
      const { row, token } = await issue();
      repository.findOne.mockResolvedValue(storedRow({ token, familyId: row.familyId }));
      await service.rotate(token, { ipAddress: '10.0.0.1' });
      return token;
    }

    it('refuses a token that was already rotated', async () => {
      const token = await rotateOnce();
      repository.findOne.mockResolvedValue(
        storedRow({ token, isRevoked: true, revocationReason: 'rotated' }),
      );

      expect(await service.rotate(token, { ipAddress: '198.51.100.7' })).toBeNull();
    });

    it('revokes the whole family and every other session of the user', async () => {
      const token = await rotateOnce();
      repository.findOne.mockResolvedValue(
        storedRow({ token, familyId: 'family-1', isRevoked: true }),
      );
      repository.find.mockResolvedValue([{ id: 'other-1' }, { id: 'other-2' }]);

      await service.rotate(token, { ipAddress: '198.51.100.7' });

      expect(repository.update).toHaveBeenCalledWith(
        { familyId: 'family-1', isRevoked: false },
        expect.objectContaining({ isRevoked: true, revocationReason: 'reuse_detected' }),
      );
      expect(repository.update).toHaveBeenCalledWith(
        { userId: 'user-1', isRevoked: false },
        expect.objectContaining({ revocationReason: 'reuse_detected' }),
      );
    });

    it('bumps tokenVersion so outstanding access tokens die', async () => {
      const token = await rotateOnce();
      repository.findOne.mockResolvedValue(
        storedRow({ token, familyId: 'family-1', isRevoked: true }),
      );

      await service.rotate(token, { ipAddress: '198.51.100.7' });

      expect(userRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'user-1', tokenVersion: 6 }),
      );
    });

    it('raises a security alert describing the event', async () => {
      const token = await rotateOnce();
      repository.findOne.mockResolvedValue(
        storedRow({ token, familyId: 'family-1', isRevoked: true }),
      );
      repository.find.mockResolvedValue([{ id: 'other-1' }]);

      await service.rotate(token, { ipAddress: '198.51.100.7', userAgent: 'attacker' });

      expect(reuseEvents).toHaveLength(1);
      expect(reuseEvents[0]).toMatchObject({
        userId: 'user-1',
        familyId: 'family-1',
        revokedSessionsCount: 1,
        ipAddress: '198.51.100.7',
        userAgent: 'attacker',
      });
    });

    it('works even when no security hook is registered', async () => {
      const token = await rotateOnce();
      service.onReuseDetected = undefined;
      repository.findOne.mockResolvedValue(
        storedRow({ token, familyId: 'family-1', isRevoked: true }),
      );

      await expect(service.rotate(token, {})).resolves.toBeNull();
    });
  });

  describe('revoke() / revokeAllForUser() / purgeExpired()', () => {
    it('revoke() records the reason', async () => {
      const row = storedRow();

      await service.revoke(row, 'logout');

      expect(row.isRevoked).toBe(true);
      expect(row.revocationReason).toBe('logout');
    });

    it('revoke() leaves an already revoked row alone', async () => {
      const row = storedRow({ isRevoked: true, revocationReason: 'rotated' });

      await service.revoke(row, 'logout');

      expect(row.revocationReason).toBe('rotated');
      expect(repository.save).not.toHaveBeenCalled();
    });

    it('revokeAllForUser() counts the affected sessions', async () => {
      repository.find.mockResolvedValue([{ id: 'a' }, { id: 'b' }, { id: 'c' }]);
      repository.update.mockResolvedValue({ affected: 3 });

      expect(await service.revokeAllForUser('user-1', 'logout')).toBe(3);
    });

    it('revokeAllForUser() skips the write when there is nothing active', async () => {
      repository.find.mockResolvedValue([]);

      expect(await service.revokeAllForUser('user-1')).toBe(0);
      expect(repository.update).not.toHaveBeenCalled();
    });

    it('purgeExpired() deletes rows past the grace period', async () => {
      repository.delete.mockResolvedValue({ affected: 4 });

      expect(await service.purgeExpired(7)).toBe(4);
    });
  });
});
