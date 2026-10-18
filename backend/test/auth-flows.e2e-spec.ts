import {
  CanActivate,
  Controller,
  ExecutionContext,
  Get,
  INestApplication,
  Injectable,
  UnauthorizedException,
  UseGuards,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Keypair } from '@stellar/stellar-sdk';
import request from 'supertest';
import { App } from 'supertest/types';
import { AuditService } from '../src/audit/audit.service';
import { AuditEvent } from '../src/audit/entities/audit-log.entity';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { RefreshToken as RefreshTokenEntity } from '../src/auth/entities/refresh-token.entity';
import { IS_PUBLIC_KEY } from '../src/auth/guards/jwt-auth.guard';
import { LogoutController } from '../src/auth/logout.controller';
import { LogoutService } from '../src/auth/logout.service';
import { NonceService, buildLoginMessage } from '../src/auth/nonce.service';
import { RefreshTokenService } from '../src/auth/refresh-token.service';
import { SESSION_STORE } from '../src/auth/sessions/session-store.port';
import { SessionsController } from '../src/auth/sessions/sessions.controller';
import { SessionsService } from '../src/auth/sessions/sessions.service';
import { TokenBlacklistService } from '../src/auth/token-blacklist.service';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { createAppValidationPipe } from '../src/common/pipes/app-validation.pipe';
import { RateLimitGuard } from '../src/rate-limit/rate-limit.guard';
import { Throttle } from '../src/rate-limit/throttle.decorator';
import { RoleName } from '../src/rbac/roles';
import { Roles } from '../src/rbac/roles.decorator';
import { RolesGuard } from '../src/rbac/roles.guard';
import { REDIS } from '../src/redis/redis.module';
import { User } from '../src/users/entities/user.entity';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'skillsync-e2e-secret';

interface TestUser {
  sub: string;
  jti?: string;
  exp?: number;
  roles?: string[];
}

/**
 * Stands in for `JwtAuthGuard`.
 *
 * Real JWT signing would make every assertion depend on token lifetimes and
 * clock skew. Reading a serialised user from `x-user` keeps these tests focused
 * on the flows (nonce, logout, revocation, RBAC, throttling) and lets a test
 * state the exact claims it needs.
 */
@Injectable()
class TestUserGuard implements CanActivate {
  constructor() {}

  canActivate(ctx: ExecutionContext): boolean {
    const isPublic = Reflect.getMetadata(IS_PUBLIC_KEY, ctx.getHandler());
    if (isPublic) return true;

    const req = ctx.switchToHttp().getRequest();
    const raw: string | undefined = req.headers['x-user'];
    if (!raw) throw new UnauthorizedException('Missing bearer token');

    req.user = JSON.parse(raw) as TestUser;
    return true;
  }
}

/**
 * In-memory stand-in for the Redis commands these flows touch.
 *
 * `eval` reimplements `RateLimitGuard`'s sliding-window script so the throttling
 * behaviour under test is the real algorithm rather than a stub that always
 * allows the request. `now` is mutable so a test can advance past a window.
 */
class FakeRedis {
  private readonly strings = new Map<string, { value: string; expiresAt: number | null }>();
  private readonly sortedSets = new Map<string, Map<number, string>>();

  now = Date.now();

  /** Clears every key: the database reset between test runs. */
  reset(): void {
    this.strings.clear();
    this.sortedSets.clear();
    this.now = Date.now();
  }

  private live(key: string): { value: string; expiresAt: number | null } | undefined {
    const entry = this.strings.get(key);
    if (!entry) return undefined;
    if (entry.expiresAt !== null && entry.expiresAt <= this.now) {
      this.strings.delete(key);
      return undefined;
    }
    return entry;
  }

  async set(key: string, value: string, _mode?: string, ttlSeconds?: number): Promise<'OK'> {
    this.strings.set(key, { value, expiresAt: ttlSeconds ? this.now + ttlSeconds * 1000 : null });
    return 'OK';
  }

  async getdel(key: string): Promise<string | null> {
    const entry = this.live(key);
    this.strings.delete(key);
    return entry?.value ?? null;
  }

  async del(key: string): Promise<number> {
    const existed = this.strings.delete(key) || this.sortedSets.delete(key);
    return existed ? 1 : 0;
  }

  async exists(key: string): Promise<number> {
    return this.live(key) ? 1 : 0;
  }

  async eval(
    _script: string,
    _numKeys: number,
    key: string,
    now: number,
    windowMs: number,
    limit: number,
    member: string,
  ): Promise<number[]> {
    this.now = now;
    const set = this.sortedSets.get(key) ?? new Map<number, string>();
    this.sortedSets.set(key, set);

    for (const score of [...set.keys()]) {
      if (score <= now - windowMs) set.delete(score);
    }
    if (set.size >= limit) return [0, set.size, Math.min(...set.keys())];

    set.set(now, member);
    return [1, set.size, now];
  }

  /** Test-only read helper. */
  has(key: string): boolean {
    return this.live(key) !== undefined;
  }
}

/** Exercises RolesGuard and RateLimitGuard without standing up the whole app. */
@Controller('admin/probe')
@UseGuards(RolesGuard, RateLimitGuard)
@Roles(RoleName.ADMIN)
class ProbeController {
  @Get('ping')
  ping() {
    return { ok: true };
  }

  @Get('hot')
  @Throttle(3, 60)
  hot() {
    return { ok: true };
  }
}

describe('Auth flows (e2e)', () => {
  let app: INestApplication<App>;
  let redis: FakeRedis;
  let nonces: NonceService;

  let audit: { record: jest.Mock };
  let refreshTokens: { issuePair: jest.Mock; rotate: jest.Mock };
  let sessionStore: { revokeAllForUser: jest.Mock; blacklistAccessToken: jest.Mock };
  let refreshRepo: Record<string, jest.Mock>;
  let userRepo: Record<string, jest.Mock>;

  const keypair = Keypair.random();
  const wallet = keypair.publicKey();
  const sign = (w: string, n: string): string =>
    keypair.sign(Buffer.from(buildLoginMessage(w, n), 'utf8')).toString('base64');
  const asUser = (user: TestUser) => JSON.stringify(user);

  beforeEach(async () => {
    redis = new FakeRedis();
    nonces = new NonceService(redis as never);

    audit = { record: jest.fn().mockResolvedValue(undefined) };

    refreshTokens = {
      issuePair: jest.fn().mockResolvedValue({ accessToken: 'access-1', refreshToken: 'refresh-1', expiresIn: 900 }),
      rotate: jest.fn().mockResolvedValue({ accessToken: 'access-2', refreshToken: 'refresh-2', expiresIn: 900 }),
    };

    sessionStore = {
      revokeAllForUser: jest.fn().mockResolvedValue(3),
      blacklistAccessToken: jest.fn().mockResolvedValue(undefined),
    };

    refreshRepo = {
      findOne: jest.fn().mockResolvedValue({ familyId: 'family-1' }),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
    };

    userRepo = {
      findOne: jest.fn().mockResolvedValue({ id: 'u1', tokenVersion: 4, roles: [] }),
      save: jest.fn(async (u: User) => u),
    };

    /**
     * `AuthService` is stubbed rather than used directly: the current
     * implementation on `main` does not compile (see the PR description), and
     * these tests are about the flows around it. The stub performs the two steps
     * the flow is defined by — consume the nonce, then issue a token pair — so
     * nonce handling is exercised for real.
     */
    class AuthServiceStub {
      requestNonce(walletAddress: string) {
        return nonces.issue(walletAddress);
      }

      async login(dto: { walletAddress: string; nonce: string }): Promise<{
        accessToken: string;
        refreshToken: string;
        expiresIn: number;
      }> {
        await nonces.consume(dto.walletAddress.toUpperCase(), dto.nonce);
        return refreshTokens.issuePair({ id: 'u1' } as never, {});
      }

      refreshTokens(token: string) {
        return refreshTokens.rotate(token, {});
      }
    }

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true })],
      controllers: [AuthController, LogoutController, SessionsController, ProbeController],
      providers: [
        { provide: AuthService, useClass: AuthServiceStub },
        { provide: NonceService, useValue: nonces },
        { provide: RefreshTokenService, useValue: refreshTokens },
        { provide: AuditService, useValue: audit },
        { provide: REDIS, useValue: redis },
        { provide: SESSION_STORE, useValue: sessionStore },
        { provide: 'ACCESS_TOKEN_TTL_SECONDS', useValue: 900 },
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(RefreshTokenEntity), useValue: refreshRepo },
        TestUserGuard,
        RolesGuard,
        RateLimitGuard,
        TokenBlacklistService,
        LogoutService,
        SessionsService,
        { provide: APP_GUARD, useClass: TestUserGuard },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
        { provide: APP_PIPE, useValue: createAppValidationPipe() },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  const fetchNonce = async (): Promise<string> => {
    const res = await request(app.getHttpServer())
      .post('/auth/nonce')
      .send({ walletAddress: wallet.toLowerCase() })
      .expect(200);
    return res.body.nonce as string;
  };

  // ── nonce ───────────────────────────────────────────────────────────────────

  describe('nonce', () => {
    it('issues a nonce for a valid wallet address', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/nonce')
        .send({ walletAddress: wallet.toLowerCase() })
        .expect(200);

      expect(res.body.nonce).toMatch(/^[0-9a-f]{64}$/);
      expect(res.body.message).toContain(wallet.toUpperCase());
      expect(typeof res.body.expiresAt).toBe('string');
    });

    it('keys the nonce on the upper-cased wallet so casing cannot fork the entry', async () => {
      await fetchNonce();
      expect(redis.has(`auth:nonce:${wallet.toUpperCase()}`)).toBe(true);
    });

    it('rejects a malformed wallet address with a field-level error', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/nonce')
        .send({ walletAddress: 'nope' })
        .expect(400);

      expect(res.body.code).toBe('E_VALIDATION_ERROR');
      expect(res.body.details).toEqual([expect.objectContaining({ field: 'walletAddress' })]);
    });

    it('is reachable without authentication', async () => {
      await request(app.getHttpServer())
        .post('/auth/nonce')
        .send({ walletAddress: wallet.toLowerCase() })
        .expect(200);
    });
  });

  // ── login ───────────────────────────────────────────────────────────────────

  describe('login', () => {
    it('logs in with a valid nonce and signature', async () => {
      const nonce = await fetchNonce();

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          walletAddress: wallet.toLowerCase(),
          nonce,
          signature: sign(wallet.toUpperCase(), nonce),
        })
        .expect(200);

      expect(res.body).toEqual({ accessToken: 'access-1', refreshToken: 'refresh-1', expiresIn: 900 });
    });

    it('rejects a replayed nonce', async () => {
      const nonce = await fetchNonce();
      const body = { walletAddress: wallet.toLowerCase(), nonce, signature: sign(wallet.toUpperCase(), nonce) };

      await request(app.getHttpServer()).post('/auth/login').send(body).expect(200);
      const replay = await request(app.getHttpServer()).post('/auth/login').send(body).expect(401);

      expect(replay.body.message).toBe('Invalid or expired nonce');
    });

    it('rejects an expired nonce once the TTL has elapsed', async () => {
      const nonce = await fetchNonce();
      redis.now += 301_000; // NONCE_TTL_SECONDS (300) + 1

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          walletAddress: wallet.toLowerCase(),
          nonce,
          signature: sign(wallet.toUpperCase(), nonce),
        })
        .expect(401);

      expect(res.body.message).toBe('Invalid or expired nonce');
    });

    it('consumes the nonce on a failed attempt so it cannot be retried', async () => {
      const nonce = await fetchNonce();
      const body = { walletAddress: wallet.toLowerCase(), nonce, signature: 'not-a-signature' };

      await request(app.getHttpServer()).post('/auth/login').send(body).expect(401);
      await request(app.getHttpServer()).post('/auth/login').send(body).expect(401);

      expect(redis.has(`auth:nonce:${wallet.toUpperCase()}`)).toBe(false);
    });

    it('rejects a mismatched signature with 401', async () => {
      const nonce = await fetchNonce();
      const impostor = Keypair.random().sign(
        Buffer.from(buildLoginMessage(wallet.toUpperCase(), nonce), 'utf8'),
      );

      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ walletAddress: wallet.toLowerCase(), nonce, signature: impostor.toString('base64') })
        .expect(401);
    });

    it('rejects a login with no signature field', async () => {
      const nonce = await fetchNonce();

      const res = await request(app.getHttpServer())
        .post('/auth/login')
        .send({ walletAddress: wallet.toLowerCase(), nonce })
        .expect(400);

      expect(res.body.details).toEqual([expect.objectContaining({ field: 'signature' })]);
    });
  });

  // ── refresh ─────────────────────────────────────────────────────────────────

  describe('refresh', () => {
    it('rotates the token pair', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: 'refresh-1' })
        .expect(200);

      expect(res.body).toEqual({ accessToken: 'access-2', refreshToken: 'refresh-2', expiresIn: 900 });
      expect(refreshTokens.rotate).toHaveBeenCalledWith('refresh-1', expect.anything());
    });

    it('rejects an empty refresh payload', async () => {
      const res = await request(app.getHttpServer()).post('/auth/refresh').send({}).expect(400);
      expect(res.body.details).toEqual([expect.objectContaining({ field: 'refreshToken' })]);
    });
  });

  // ── logout and token blacklisting ───────────────────────────────────────────

  describe('logout', () => {
    const exp = Math.floor(Date.now() / 1000) + 600;

    it('blacklists the access token for its remaining lifetime', async () => {
      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('x-user', asUser({ sub: 'u1', jti: 'jti-1', exp }))
        .send({ refreshToken: 'refresh-1' })
        .expect(204);

      expect(await redis.exists('auth:blacklist:jti-1')).toBe(1);
    });

    it('revokes the refresh token family', async () => {
      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('x-user', asUser({ sub: 'u1', jti: 'jti-1', exp }))
        .send({ refreshToken: 'refresh-1' })
        .expect(204);

      expect(refreshRepo.update).toHaveBeenCalledWith(
        { familyId: 'family-1', revokedAt: expect.anything() },
        { revokedAt: expect.any(Date) },
      );
    });

    it('writes a LOGOUT audit entry', async () => {
      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('x-user', asUser({ sub: 'u1', jti: 'jti-1', exp }))
        .send({})
        .expect(204);

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ event: AuditEvent.LOGOUT, userId: 'u1' }),
      );
    });

    it('looks the refresh token up by hash, never by the raw value', async () => {
      await request(app.getHttpServer())
        .post('/auth/logout')
        .set('x-user', asUser({ sub: 'u1', jti: 'jti-1', exp }))
        .send({ refreshToken: 'refresh-1' })
        .expect(204);

      const where = refreshRepo.findOne.mock.calls[0][0].where as { tokenHash: string };
      expect(where.tokenHash).not.toBe('refresh-1');
      expect(where.tokenHash).toMatch(/^[0-9a-f]{64}$/);
    });

    it('requires authentication', async () => {
      const res = await request(app.getHttpServer()).post('/auth/logout').send({}).expect(401);
      expect(res.body.message).toBe('Missing bearer token');
    });
  });

  // ── session revocation ──────────────────────────────────────────────────────

  describe('session revocation', () => {
    it('revokes every session and reports the new token version', async () => {
      const res = await request(app.getHttpServer())
        .post('/auth/sessions/revoke-all')
        .set('x-user', asUser({ sub: 'u1', jti: 'jti-1' }))
        .expect(200);

      expect(res.body).toEqual({ revokedSessions: 3, tokenVersion: 5 });
      expect(sessionStore.revokeAllForUser).toHaveBeenCalledWith('u1');
    });

    it('blacklists the current access token so it dies immediately', async () => {
      await request(app.getHttpServer())
        .post('/auth/sessions/revoke-all')
        .set('x-user', asUser({ sub: 'u1', jti: 'jti-1' }))
        .expect(200);

      expect(sessionStore.blacklistAccessToken).toHaveBeenCalledWith('jti-1', 900);
    });

    it('404s for an unknown user and revokes nothing', async () => {
      userRepo.findOne.mockResolvedValue(null);

      await request(app.getHttpServer())
        .post('/auth/sessions/revoke-all')
        .set('x-user', asUser({ sub: 'ghost', jti: 'jti-1' }))
        .expect(404);

      expect(sessionStore.revokeAllForUser).not.toHaveBeenCalled();
    });

    it('requires authentication', async () => {
      await request(app.getHttpServer()).post('/auth/sessions/revoke-all').expect(401);
    });
  });

  // ── role-based access ───────────────────────────────────────────────────────

  describe('role-based access', () => {
    const admin = { sub: 'a1', roles: ['admin'] };
    const mentor = { sub: 'm1', roles: ['mentor'] };

    it('allows an admin through', async () => {
      await request(app.getHttpServer()).get('/admin/probe/ping').set('x-user', asUser(admin)).expect(200);
    });

    it('rejects a mentor with 403', async () => {
      const res = await request(app.getHttpServer())
        .get('/admin/probe/ping')
        .set('x-user', asUser(mentor))
        .expect(403);

      expect(res.body.message).toBe('Insufficient role');
    });

    it('rejects an unauthenticated caller with 401', async () => {
      const res = await request(app.getHttpServer()).get('/admin/probe/ping').expect(401);
      expect(res.body.message).toBe('Missing bearer token');
    });

    it('rejects a caller with no roles at all', async () => {
      await request(app.getHttpServer())
        .get('/admin/probe/ping')
        .set('x-user', asUser({ sub: 'x1' }))
        .expect(403);
    });
  });

  // ── rate limiting ───────────────────────────────────────────────────────────

  describe('rate limiting', () => {
    const hot = (sub: string) =>
      request(app.getHttpServer())
        .get('/admin/probe/hot')
        .set('x-user', asUser({ sub, roles: ['admin'] }));

    it('allows requests up to the per-route throttle', async () => {
      for (let i = 0; i < 3; i += 1) await hot('rl-1').expect(200);
    });

    it('returns 429 with Retry-After once the throttle is exceeded', async () => {
      for (let i = 0; i < 3; i += 1) await hot('rl-2').expect(200);

      const res = await hot('rl-2').expect(429);

      expect(res.body.message).toBe('Too many requests');
      expect(Number(res.headers['retry-after'])).toBeGreaterThan(0);
    });

    it('advertises the limit and the remaining quota', async () => {
      const res = await hot('rl-3').expect(200);

      expect(res.headers['x-ratelimit-limit']).toBe('3');
      expect(res.headers['x-ratelimit-remaining']).toBe('2');
    });

    it('counts each subject separately so one caller cannot exhaust another', async () => {
      for (let i = 0; i < 3; i += 1) await hot('noisy').expect(200);
      await hot('noisy').expect(429);

      await hot('quiet').expect(200);
    });

    it('lets a throttled subject back in once the window has slid past', async () => {
      for (let i = 0; i < 3; i += 1) await hot('rl-4').expect(200);
      await hot('rl-4').expect(429);

      redis.now += 61_000; // window is 60s
      await hot('rl-4').expect(200);
    });

    it('does not apply the per-route throttle to a different route', async () => {
      for (let i = 0; i < 3; i += 1) await hot('rl-5').expect(200);
      await hot('rl-5').expect(429);

      await request(app.getHttpServer())
        .get('/admin/probe/ping')
        .set('x-user', asUser({ sub: 'rl-5', roles: ['admin'] }))
        .expect(200);
    });
  });
});