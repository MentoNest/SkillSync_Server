/**
 * E2E Authentication Tests — SkillSync Server
 * Uses supertest against a real HTTP server with an isolated test DB + Redis.
 * Stellar signature verification is mocked for determinism.
 *
 * Run: jest --testPathPattern=auth.e2e --runInBand
 */

import request from 'supertest';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository, DataSource } from 'typeorm';
import Redis from 'ioredis';

import { AppModule } from '../src/app.module';
import { User } from '../src/auth/entities/user.entity';
import { Session } from '../src/auth/entities/session.entity';
import { TokenBlacklist } from '../src/auth/entities/token-blacklist.entity';
import { StellarVerificationService } from '../src/auth/services/stellar-verification.service';

// ─── Constants ────────────────────────────────────────────────────────────────

const VALID_ADDRESS   = 'GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW';
const VALID_SIGNATURE = 'valid_mock_signature';
const INVALID_SIG     = 'invalid_signature';
const ADMIN_ADDRESS   = 'GADMINADDRESSEXAMPLESTELLARADDRESSFORTESTINGPURPOSESONLY1';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function authPayload(
  address = VALID_ADDRESS,
  signature = VALID_SIGNATURE,
  nonce?: string,
) {
  return { address, signature, nonce };
}

async function loginAs(
  app: INestApplication,
  address = VALID_ADDRESS,
  signature = VALID_SIGNATURE,
): Promise<{ accessToken: string; refreshToken: string; nonce: string }> {
  const nonceRes = await request(app.getHttpServer())
    .get(`/auth/nonce/${address}`)
    .expect(200);

  const { nonce } = nonceRes.body;

  const loginRes = await request(app.getHttpServer())
    .post('/auth/login')
    .send(authPayload(address, signature, nonce))
    .expect(200);

  return {
    accessToken:  loginRes.body.accessToken,
    refreshToken: loginRes.body.refreshToken,
    nonce,
  };
}

// ─── Setup / teardown ─────────────────────────────────────────────────────────

let app:              INestApplication;
let dataSource:       DataSource;
let redis:            Redis;
let userRepo:         Repository<User>;
let sessionRepo:      Repository<Session>;
let blacklistRepo:    Repository<TokenBlacklist>;
let stellarVerifier:  jest.Mocked<StellarVerificationService>;

beforeAll(async () => {
  const moduleRef: TestingModule = await Test.createTestingModule({
    imports: [AppModule],
  })
    .overrideProvider(StellarVerificationService)
    .useValue({
      // Deterministic mock: signature is valid iff it equals VALID_SIGNATURE
      verifySignature: jest.fn(
        (_address: string, _nonce: string, signature: string) =>
          Promise.resolve(signature === VALID_SIGNATURE),
      ),
    } satisfies Partial<StellarVerificationService>)
    .compile();

  app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
  await app.init();

  dataSource    = moduleRef.get(DataSource);
  redis         = moduleRef.get<Redis>('REDIS_CLIENT');
  userRepo      = moduleRef.get(getRepositoryToken(User));
  sessionRepo   = moduleRef.get(getRepositoryToken(Session));
  blacklistRepo = moduleRef.get(getRepositoryToken(TokenBlacklist));
  stellarVerifier = moduleRef.get(StellarVerificationService) as jest.Mocked<StellarVerificationService>;

  // Seed an admin user used by role-based tests
  await userRepo.save(
    userRepo.create({ address: ADMIN_ADDRESS, role: 'admin' }),
  );
});

afterAll(async () => {
  await dataSource.dropDatabase();
  await redis.flushdb();
  await app.close();
});

/** Wipe transient state between test groups without dropping the schema. */
async function resetAuth() {
  await blacklistRepo.delete({});
  await sessionRepo.delete({});
  await userRepo.delete({ address: VALID_ADDRESS }); // recreated per test
  await redis.flushdb();
  stellarVerifier.verifySignature.mockClear();
}

// ─── 1. Nonce endpoint ────────────────────────────────────────────────────────

describe('GET /auth/nonce/:address', () => {
  afterEach(resetAuth);

  it('returns a nonce for a valid Stellar address', async () => {
    const res = await request(app.getHttpServer())
      .get(`/auth/nonce/${VALID_ADDRESS}`)
      .expect(200);

    expect(res.body).toHaveProperty('nonce');
    expect(typeof res.body.nonce).toBe('string');
    expect(res.body.nonce.length).toBeGreaterThan(8);
  });

  it('generates a different nonce on each request', async () => {
    const [a, b] = await Promise.all([
      request(app.getHttpServer()).get(`/auth/nonce/${VALID_ADDRESS}`),
      request(app.getHttpServer()).get(`/auth/nonce/${VALID_ADDRESS}`),
    ]);
    expect(a.body.nonce).not.toBe(b.body.nonce);
  });

  it('returns 400 for a malformed address', async () => {
    await request(app.getHttpServer())
      .get('/auth/nonce/not-a-stellar-address')
      .expect(400);
  });
});

// ─── 2. Login ─────────────────────────────────────────────────────────────────

describe('POST /auth/login', () => {
  afterEach(resetAuth);

  it('returns access and refresh tokens for valid credentials', async () => {
    const nonceRes = await request(app.getHttpServer())
      .get(`/auth/nonce/${VALID_ADDRESS}`)
      .expect(200);

    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send(authPayload(VALID_ADDRESS, VALID_SIGNATURE, nonceRes.body.nonce))
      .expect(200);

    expect(res.body).toMatchObject({
      accessToken:  expect.any(String),
      refreshToken: expect.any(String),
    });
  });

  it('creates or updates the user record on first login', async () => {
    const { nonce } = (
      await request(app.getHttpServer()).get(`/auth/nonce/${VALID_ADDRESS}`)
    ).body;

    await request(app.getHttpServer())
      .post('/auth/login')
      .send(authPayload(VALID_ADDRESS, VALID_SIGNATURE, nonce))
      .expect(200);

    const user = await userRepo.findOneBy({ address: VALID_ADDRESS });
    expect(user).not.toBeNull();
  });

  it('rejects login with an invalid signature → 401', async () => {
    const { nonce } = (
      await request(app.getHttpServer()).get(`/auth/nonce/${VALID_ADDRESS}`)
    ).body;

    await request(app.getHttpServer())
      .post('/auth/login')
      .send(authPayload(VALID_ADDRESS, INVALID_SIG, nonce))
      .expect(401);
  });

  it('rejects login with an expired / already-used nonce → 401', async () => {
    const { nonce } = (
      await request(app.getHttpServer()).get(`/auth/nonce/${VALID_ADDRESS}`)
    ).body;

    // First login consumes the nonce
    await request(app.getHttpServer())
      .post('/auth/login')
      .send(authPayload(VALID_ADDRESS, VALID_SIGNATURE, nonce))
      .expect(200);

    // Second attempt with the same nonce must fail
    await request(app.getHttpServer())
      .post('/auth/login')
      .send(authPayload(VALID_ADDRESS, VALID_SIGNATURE, nonce))
      .expect(401);
  });

  it('rejects login with a nonce that was never issued → 401', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send(authPayload(VALID_ADDRESS, VALID_SIGNATURE, 'made-up-nonce'))
      .expect(401);
  });

  it('returns 400 when required fields are missing', async () => {
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ address: VALID_ADDRESS })
      .expect(400);
  });
});

// ─── 3. Refresh token ─────────────────────────────────────────────────────────

describe('POST /auth/refresh', () => {
  afterEach(resetAuth);

  it('issues a new access token given a valid refresh token', async () => {
    const { refreshToken } = await loginAs(app);

    const res = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken })
      .expect(200);

    expect(res.body).toHaveProperty('accessToken');
    expect(typeof res.body.accessToken).toBe('string');
  });

  it('invalidates the old refresh token after rotation (one-time use)', async () => {
    const { refreshToken } = await loginAs(app);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken })
      .expect(200);

    // Replaying the same refresh token must now fail
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken })
      .expect(401);
  });

  it('rejects a tampered refresh token → 401', async () => {
    const { refreshToken } = await loginAs(app);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: refreshToken + 'tampered' })
      .expect(401);
  });

  it('rejects a blacklisted refresh token → 401', async () => {
    const { accessToken, refreshToken } = await loginAs(app);

    // Logout blacklists the refresh token
    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken })
      .expect(200);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken })
      .expect(401);
  });
});

// ─── 4. Logout ────────────────────────────────────────────────────────────────

describe('POST /auth/logout', () => {
  afterEach(resetAuth);

  it('returns 200 and invalidates the session on logout', async () => {
    const { accessToken, refreshToken } = await loginAs(app);

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken })
      .expect(200);
  });

  it('blacklists the access token so it cannot be reused', async () => {
    const { accessToken, refreshToken } = await loginAs(app);

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken })
      .expect(200);

    // A protected endpoint must reject the blacklisted token
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(401);
  });

  it('returns 401 when called without a token', async () => {
    await request(app.getHttpServer())
      .post('/auth/logout')
      .send({ refreshToken: 'any' })
      .expect(401);
  });
});

// ─── 5. Token blacklisting ────────────────────────────────────────────────────

describe('Token blacklisting', () => {
  afterEach(resetAuth);

  it('access token works before logout', async () => {
    const { accessToken } = await loginAs(app);

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
  });

  it('access token is rejected after logout', async () => {
    const { accessToken, refreshToken } = await loginAs(app);

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken });

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(401);
  });

  it('persists the blacklist entry in the database', async () => {
    const { accessToken, refreshToken } = await loginAs(app);

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ refreshToken });

    const entry = await blacklistRepo.findOneBy({ token: accessToken });
    expect(entry).not.toBeNull();
  });
});

// ─── 6. Session revocation ────────────────────────────────────────────────────

describe('Session revocation', () => {
  afterEach(resetAuth);

  it('revoking all sessions invalidates all active refresh tokens', async () => {
    // Login twice to create two concurrent sessions
    const [session1, session2] = await Promise.all([
      loginAs(app),
      loginAs(app),
    ]);

    await request(app.getHttpServer())
      .post('/auth/sessions/revoke-all')
      .set('Authorization', `Bearer ${session1.accessToken}`)
      .expect(200);

    await Promise.all([
      request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: session1.refreshToken })
        .expect(401),
      request(app.getHttpServer())
        .post('/auth/refresh')
        .send({ refreshToken: session2.refreshToken })
        .expect(401),
    ]);
  });

  it('returns 401 when revoking sessions without authentication', async () => {
    await request(app.getHttpServer())
      .post('/auth/sessions/revoke-all')
      .expect(401);
  });
});

// ─── 7. Protected route access ────────────────────────────────────────────────

describe('GET /auth/me (protected route)', () => {
  afterEach(resetAuth);

  it('returns the authenticated user profile with a valid token', async () => {
    const { accessToken } = await loginAs(app);

    const res = await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);

    expect(res.body).toMatchObject({ address: VALID_ADDRESS });
  });

  it('returns 401 when no token is provided', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
  });

  it('returns 401 for a malformed Bearer token', async () => {
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', 'Bearer not.a.jwt')
      .expect(401);
  });

  it('returns 401 for a token with a forged signature', async () => {
    const { accessToken } = await loginAs(app);
    const [header, payload] = accessToken.split('.');
    const forged = `${header}.${payload}.invalidsignature`;

    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${forged}`)
      .expect(401);
  });
});

// ─── 8. Role-based access control ────────────────────────────────────────────

describe('Role-based access control', () => {
  afterEach(resetAuth);

  it('allows an admin to access an admin-only endpoint', async () => {
    const { accessToken } = await loginAs(app, ADMIN_ADDRESS);

    await request(app.getHttpServer())
      .get('/admin/users')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
  });

  it('returns 403 when a regular user hits an admin-only endpoint', async () => {
    const { accessToken } = await loginAs(app, VALID_ADDRESS);

    await request(app.getHttpServer())
      .get('/admin/users')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
  });

  it('returns 401 for an unauthenticated request to an admin endpoint', async () => {
    await request(app.getHttpServer()).get('/admin/users').expect(401);
  });
});

// ─── 9. Rate limiting ─────────────────────────────────────────────────────────

describe('Rate limiting on auth endpoints', () => {
  afterEach(resetAuth);

  it('returns 429 after exceeding the login rate limit', async () => {
    const LIMIT = 5; // match your ThrottlerGuard config for /auth/login

    // Exhaust the limit with invalid requests (avoids consuming nonces)
    const requests = Array.from({ length: LIMIT }, () =>
      request(app.getHttpServer())
        .post('/auth/login')
        .send(authPayload(VALID_ADDRESS, INVALID_SIG, 'dummy-nonce')),
    );
    await Promise.all(requests);

    // The next request must be throttled
    const throttled = await request(app.getHttpServer())
      .post('/auth/login')
      .send(authPayload(VALID_ADDRESS, INVALID_SIG, 'dummy-nonce'));

    expect(throttled.status).toBe(429);
  });

  it('returns 429 after exceeding the nonce request rate limit', async () => {
    const LIMIT = 10;

    for (let i = 0; i < LIMIT; i++) {
      await request(app.getHttpServer()).get(`/auth/nonce/${VALID_ADDRESS}`);
    }

    const throttled = await request(app.getHttpServer()).get(
      `/auth/nonce/${VALID_ADDRESS}`,
    );
    expect(throttled.status).toBe(429);
  });

  it('includes Retry-After header in the 429 response', async () => {
    const LIMIT = 5;
    for (let i = 0; i <= LIMIT; i++) {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send(authPayload(VALID_ADDRESS, INVALID_SIG, 'dummy'));
    }

    const throttled = await request(app.getHttpServer())
      .post('/auth/login')
      .send(authPayload(VALID_ADDRESS, INVALID_SIG, 'dummy'));

    expect(throttled.headers).toHaveProperty('retry-after');
  });
});

// ─── 10. Concurrent request safety ───────────────────────────────────────────

describe('Concurrent request safety', () => {
  afterEach(resetAuth);

  it('handles concurrent logins from the same address without duplicating the user row', async () => {
    const nonceRes = await request(app.getHttpServer())
      .get(`/auth/nonce/${VALID_ADDRESS}`)
      .expect(200);

    // Fan out 5 simultaneous login attempts with the same nonce
    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        request(app.getHttpServer())
          .post('/auth/login')
          .send(authPayload(VALID_ADDRESS, VALID_SIGNATURE, nonceRes.body.nonce)),
      ),
    );

    // Only one should succeed (nonce is single-use)
    const successes = results.filter(
      (r) => r.status === 'fulfilled' && r.value.status === 200,
    );
    expect(successes.length).toBe(1);

    const count = await userRepo.count({ where: { address: VALID_ADDRESS } });
    expect(count).toBe(1);
  });

  it('handles concurrent refresh token requests gracefully', async () => {
    const { refreshToken } = await loginAs(app);

    const results = await Promise.allSettled(
      Array.from({ length: 5 }, () =>
        request(app.getHttpServer())
          .post('/auth/refresh')
          .send({ refreshToken }),
      ),
    );

    const successes = results.filter(
      (r) => r.status === 'fulfilled' && r.value.status === 200,
    );
    // Refresh tokens are single-use — only one rotation should succeed
    expect(successes.length).toBe(1);
  });
});