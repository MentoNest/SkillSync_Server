import { ForbiddenException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Keypair } from '@stellar/stellar-sdk';
import {
  InvalidCredentialsException,
  TokenExpiredException,
} from '../../common/errors/app-exceptions';
import { UserStatus } from '../../user/user-status.enum';
import { AuthService, loginMessage } from '../auth.service';
import { AuthConfig, buildAuthConfig, Role } from '../auth.types';
import { FakeRedisService } from './fake-redis';
import { FakeUserRepository } from './fake-user-repository';

const config = (over: Partial<AuthConfig> = {}): AuthConfig => ({
  jwtSecret: 'test-secret-test-secret',
  accessTtlSeconds: 900,
  refreshTtlSeconds: 3600,
  nonceTtlSeconds: 300,
  adminAddresses: [],
  mentorAddresses: [],
  requireEmailVerification: false,
  ...over,
});

function setup(
  over: Partial<AuthConfig> = {},
  suspensionRows: Array<Record<string, unknown>> = [],
) {
  const redis = new FakeRedisService();
  const jwt = new JwtService();
  const userRepo = new FakeUserRepository();
  const suspensions = {
    findOne: jest.fn(
      async ({
        where,
      }: {
        where: { walletAddress: string; isActive: boolean };
      }) =>
        suspensionRows.find(
          (s) =>
            s.walletAddress === where.walletAddress &&
            s.isActive === where.isActive,
        ) ?? null,
    ),
    save: jest.fn(async (s: Record<string, unknown>) => s),
  };
  const auditService = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new AuthService(
    jwt,
    redis as never,
    config(over),
    userRepo as never,
    suspensions as never,
    auditService as never,
  );
  return { redis, jwt, userRepo, suspensions, auditService, service };
}

async function signedLogin(service: AuthService, keypair: Keypair) {
  const { nonce } = await service.createNonce(keypair.publicKey());
  const signature = keypair
    .sign(Buffer.from(loginMessage(keypair.publicKey(), nonce)))
    .toString('base64');
  return { nonce, signature };
}

describe('AuthService', () => {
  const keypair = Keypair.random();

  it('logs in with a valid signature and issues access and refresh tokens', async () => {
    const { service, jwt } = setup();
    const { signature } = await signedLogin(service, keypair);

    const tokens = await service.login(keypair.publicKey(), signature);

    expect(tokens.expiresIn).toBe(900);
    const access = jwt.decode(tokens.accessToken);
    const refresh = jwt.decode(tokens.refreshToken);
    expect(access).toMatchObject({
      sub: keypair.publicKey().toLowerCase(),
      status: UserStatus.ACTIVE,
      type: 'access',
      roles: [Role.USER],
    });
    expect(refresh).toMatchObject({
      sub: keypair.publicKey().toLowerCase(),
      type: 'refresh',
    });
    expect(access.jti).not.toBe(refresh.jti);
  });

  it('rejects a signature from another key and consumes the nonce', async () => {
    const { service } = setup();
    const { nonce } = await service.createNonce(keypair.publicKey());
    const forged = Keypair.random()
      .sign(Buffer.from(loginMessage(keypair.publicKey(), nonce)))
      .toString('base64');

    await expect(
      service.login(keypair.publicKey(), forged),
    ).rejects.toBeInstanceOf(InvalidCredentialsException);
    // The nonce is gone, so even the right signature is refused now.
    const good = keypair
      .sign(Buffer.from(loginMessage(keypair.publicKey(), nonce)))
      .toString('base64');
    await expect(
      service.login(keypair.publicKey(), good),
    ).rejects.toBeInstanceOf(InvalidCredentialsException);
  });

  it('does not accept a replayed signature', async () => {
    const { service } = setup();
    const { signature } = await signedLogin(service, keypair);
    await service.login(keypair.publicKey(), signature);
    await expect(
      service.login(keypair.publicKey(), signature),
    ).rejects.toBeInstanceOf(InvalidCredentialsException);
  });

  it('rejects login without a nonce and malformed signatures', async () => {
    const { service } = setup();
    await expect(
      service.login(keypair.publicKey(), 'AAAA'),
    ).rejects.toBeInstanceOf(InvalidCredentialsException);
    await service.createNonce(keypair.publicKey());
    await expect(
      service.login(keypair.publicKey(), '%%%'),
    ).rejects.toBeInstanceOf(InvalidCredentialsException);
  });

  it('issues 256-bit hex nonces with expiry and replaces earlier wallet nonces', async () => {
    const { service, redis } = setup();
    const first = await service.createNonceWithExpiry(keypair.publicKey());
    const second = await service.createNonceWithExpiry(keypair.publicKey());

    expect(first.nonce).toMatch(/^[a-f0-9]{64}$/);
    expect(second.nonce).not.toBe(first.nonce);
    expect(Number.isNaN(Date.parse(first.expiresAt))).toBe(false);
    expect(
      redis.store.get(`session:nonce:${keypair.publicKey().toLowerCase()}`),
    ).toBe(second.nonce);
  });

  it('uses the canonical address for nonce storage and accepts case variants at login', async () => {
    const { service, jwt, redis } = setup();
    const lowerAddress = keypair.publicKey().toLowerCase();
    const { nonce, message } = await service.createNonce(` ${lowerAddress} `);
    const signature = keypair.sign(Buffer.from(message)).toString('base64');

    expect(message).toContain(`Address: ${lowerAddress}`);
    expect(redis.store.get(`session:nonce:${lowerAddress}`)).toBe(nonce);
    const tokens = await service.login(keypair.publicKey(), signature);
    expect(jwt.decode(tokens.accessToken)).toMatchObject({ sub: lowerAddress });
  });

  it('limits nonce requests to five per wallet per minute', async () => {
    const { service } = setup();
    for (let i = 0; i < 5; i++)
      await service.createNonceWithExpiry(keypair.publicKey());

    await expect(
      service.createNonceWithExpiry(keypair.publicKey()),
    ).rejects.toMatchObject({ status: 429 });
  });

  it('assigns roles from configured addresses', async () => {
    const { service } = setup({
      adminAddresses: [keypair.publicKey()],
      mentorAddresses: [keypair.publicKey()],
    });
    expect(service.rolesFor(keypair.publicKey())).toEqual([
      Role.USER,
      Role.MENTOR,
      Role.ADMIN,
    ]);
    expect(service.rolesFor(Keypair.random().publicKey())).toEqual([Role.USER]);
  });

  describe('refresh', () => {
    it('rotates the refresh token so the old one cannot be reused', async () => {
      const { service } = setup();
      const { signature } = await signedLogin(service, keypair);
      const first = await service.login(keypair.publicKey(), signature);

      const second = await service.refresh(first.refreshToken);

      expect(second.refreshToken).not.toBe(first.refreshToken);
      await expect(service.refresh(first.refreshToken)).rejects.toBeInstanceOf(
        InvalidCredentialsException,
      );
      await expect(service.refresh(second.refreshToken)).resolves.toBeDefined();
    });

    it('rejects access tokens, garbage and expired tokens', async () => {
      const { service, jwt } = setup();
      const { signature } = await signedLogin(service, keypair);
      const tokens = await service.login(keypair.publicKey(), signature);

      await expect(service.refresh(tokens.accessToken)).rejects.toBeInstanceOf(
        InvalidCredentialsException,
      );
      await expect(service.refresh('not-a-token')).rejects.toBeInstanceOf(
        InvalidCredentialsException,
      );

      const expired = await jwt.signAsync(
        { sub: keypair.publicKey(), type: 'refresh', jti: 'x', roles: [] },
        { secret: 'test-secret-test-secret', expiresIn: -10 },
      );
      await expect(service.refresh(expired)).rejects.toBeInstanceOf(
        TokenExpiredException,
      );
    });
  });

  describe('logout', () => {
    it('blacklists the access token and revokes the refresh token', async () => {
      const { service, jwt } = setup();
      const { signature } = await signedLogin(service, keypair);
      const tokens = await service.login(keypair.publicKey(), signature);
      const access = jwt.decode(tokens.accessToken);

      await service.logout(
        {
          address: keypair.publicKey(),
          roles: [Role.USER],
          status: UserStatus.ACTIVE,
          jti: access.jti,
        },
        tokens.refreshToken,
      );

      expect(await service.isRevoked(access.jti)).toBe(true);
      await expect(service.refresh(tokens.refreshToken)).rejects.toBeInstanceOf(
        InvalidCredentialsException,
      );
    });

    it('ignores a refresh token that belongs to someone else', async () => {
      const { service } = setup();
      const other = Keypair.random();
      const mine = await service.login(
        keypair.publicKey(),
        (await signedLogin(service, keypair)).signature,
      );
      const theirs = await service.login(
        other.publicKey(),
        (await signedLogin(service, other)).signature,
      );

      await service.logout(
        {
          address: keypair.publicKey(),
          roles: [],
          status: UserStatus.ACTIVE,
          jti: 'j',
        },
        theirs.refreshToken,
      );

      await expect(service.refresh(theirs.refreshToken)).resolves.toBeDefined();
      expect(mine.accessToken).toBeDefined();
    });
  });

  describe('revoke all sessions', () => {
    it('deletes every refresh token and invalidates access tokens by version', async () => {
      const { service, jwt } = setup();
      const first = await service.login(
        keypair.publicKey(),
        (await signedLogin(service, keypair)).signature,
      );
      const second = await service.login(
        keypair.publicKey(),
        (await signedLogin(service, keypair)).signature,
      );
      const firstAccess = jwt.decode(first.accessToken) as {
        jti: string;
        ver: number;
      };

      await expect(
        service.revokeAllSessions({
          address: keypair.publicKey(),
          roles: [Role.USER],
          status: UserStatus.ACTIVE,
          jti: firstAccess.jti,
        }),
      ).resolves.toBe(2);
      await expect(service.refresh(first.refreshToken)).rejects.toBeInstanceOf(
        InvalidCredentialsException,
      );
      await expect(service.refresh(second.refreshToken)).rejects.toBeInstanceOf(
        InvalidCredentialsException,
      );
      await expect(
        service.isTokenVersionCurrent(keypair.publicKey(), firstAccess.ver),
      ).resolves.toBe(false);
    });

    it('limits each caller to three revocation requests per hour', async () => {
      const { service } = setup();
      const user = {
        address: keypair.publicKey(),
        roles: [Role.USER],
        status: UserStatus.ACTIVE,
        jti: 'access',
      };

      for (let i = 0; i < 3; i++) await service.revokeAllSessions(user);
      await expect(service.revokeAllSessions(user)).rejects.toMatchObject({
        status: 429,
      });
    });
  });

  describe('user status & suspension checks at login', () => {
    it('blocks permanently suspended users with 403 and reason', async () => {
      const addr = keypair.publicKey().toLowerCase();
      const { service, userRepo } = setup({}, [
        {
          id: 'susp-1',
          walletAddress: addr,
          reason: 'Abusive behavior',
          suspendedUntil: null,
          isActive: true,
        },
      ]);
      userRepo.users.set(addr, {
        walletAddress: addr,
        tokenVersion: 0,
        status: UserStatus.SUSPENDED,
      });

      const { signature } = await signedLogin(service, keypair);
      await expect(
        service.login(keypair.publicKey(), signature),
      ).rejects.toMatchObject({
        status: 403,
        response: expect.objectContaining({
          code: 'ACCOUNT_SUSPENDED',
          reason: 'Abusive behavior',
          suspendedUntil: null,
        }),
      });
    });

    it('blocks temporarily suspended users with expected end date', async () => {
      const addr = keypair.publicKey().toLowerCase();
      const until = new Date(Date.now() + 86_400_000);
      const { service, userRepo } = setup({}, [
        {
          id: 'susp-2',
          walletAddress: addr,
          reason: 'Spamming chat',
          suspendedUntil: until,
          isActive: true,
        },
      ]);
      userRepo.users.set(addr, {
        walletAddress: addr,
        tokenVersion: 0,
        status: UserStatus.SUSPENDED,
      });

      const { signature } = await signedLogin(service, keypair);
      await expect(
        service.login(keypair.publicKey(), signature),
      ).rejects.toMatchObject({
        status: 403,
        response: expect.objectContaining({
          code: 'ACCOUNT_SUSPENDED',
          reason: 'Spamming chat',
          suspendedUntil: until.toISOString(),
        }),
      });
    });

    it('automatically expires temporary suspensions at login and restores active status', async () => {
      const addr = keypair.publicKey().toLowerCase();
      const expiredAt = new Date(Date.now() - 60_000);
      const susp = {
        id: 'susp-3',
        walletAddress: addr,
        reason: 'Cooling off',
        suspendedUntil: expiredAt,
        isActive: true,
        liftedAt: null as Date | null,
        liftedBy: null as string | null,
      };
      const { service, userRepo, suspensions, auditService } = setup({}, [
        susp,
      ]);
      userRepo.users.set(addr, {
        walletAddress: addr,
        tokenVersion: 0,
        status: UserStatus.SUSPENDED,
      });

      const { signature } = await signedLogin(service, keypair);
      const tokens = await service.login(keypair.publicKey(), signature);

      expect(tokens.accessToken).toBeDefined();
      expect(susp.isActive).toBe(false);
      expect(susp.liftedBy).toBe('system:expired');
      expect(suspensions.save).toHaveBeenCalled();
      expect(userRepo.users.get(addr)?.status).toBe(UserStatus.ACTIVE);
      expect(auditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          event: 'user_suspension_expired',
          targetId: addr,
        }),
      );
    });

    it('rejects deleted and pending_verification accounts on login', async () => {
      const addr = keypair.publicKey().toLowerCase();
      const { service, userRepo } = setup();

      userRepo.users.set(addr, {
        walletAddress: addr,
        tokenVersion: 0,
        status: UserStatus.PENDING_VERIFICATION,
      });
      await expect(
        service.login(
          keypair.publicKey(),
          (await signedLogin(service, keypair)).signature,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);

      userRepo.users.set(addr, {
        walletAddress: addr,
        tokenVersion: 0,
        status: UserStatus.DELETED,
      });
      await expect(
        service.login(
          keypair.publicKey(),
          (await signedLogin(service, keypair)).signature,
        ),
      ).rejects.toBeInstanceOf(ForbiddenException);
    });
  });
});

describe('buildAuthConfig', () => {
  it('requires a strong enough JWT_SECRET', () => {
    expect(() => buildAuthConfig(() => undefined)).toThrow('JWT_SECRET');
    expect(() =>
      buildAuthConfig((k) => (k === 'JWT_SECRET' ? 'short' : undefined)),
    ).toThrow('JWT_SECRET');
  });

  it('applies defaults and parses address lists', () => {
    const env: Record<string, string> = {
      JWT_SECRET: 'x'.repeat(20),
      AUTH_ADMIN_ADDRESSES: ' GA, GB ,,',
      JWT_ACCESS_TTL_SECONDS: 'nope',
    };
    const built = buildAuthConfig((k) => env[k]);
    expect(built).toMatchObject({
      accessTtlSeconds: 900,
      refreshTtlSeconds: 604800,
      nonceTtlSeconds: 300,
      adminAddresses: ['GA', 'GB'],
      mentorAddresses: [],
    });
  });
});
