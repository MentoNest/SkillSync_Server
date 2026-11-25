import { Controller, Get, INestApplication, UseGuards } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Keypair } from '@stellar/stellar-sdk';
import request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AllExceptionsFilter } from '../../common/filters/all-exceptions.filter';
import { createValidationPipe } from '../../common/filters/validation';
import { REDIS_CLIENT, RedisService } from '../../redis/redis.service';
import { UserSuspension } from '../../admin/entities/user-suspension.entity';
import { AuditLog } from '../../audit/entities/audit-log.entity';
import { User } from '../../user/user.entity';
import { AuthModule } from '../auth.module';
import { loginMessage } from '../auth.service';
import { Role } from '../auth.types';
import { Roles } from '../decorators/roles.decorator';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { FakeRedisService } from './fake-redis';

@Controller('protected')
@UseGuards(JwtAuthGuard, RolesGuard)
class ProtectedController {
  @Get() any() {
    return { ok: true };
  }
  @Get('admin') @Roles(Role.ADMIN) admin() {
    return { admin: true };
  }
}

describe('Auth (e2e)', () => {
  let app: INestApplication;
  let redis: FakeRedisService;
  const users = new Map<
    string,
    { walletAddress: string; tokenVersion: number }
  >();
  const keypair = Keypair.random();
  const adminKeypair = Keypair.random();

  beforeAll(async () => {
    process.env.JWT_SECRET = 'e2e-secret-e2e-secret';
    process.env.AUTH_NONCE_TTL_SECONDS = '2';
    process.env.AUTH_ADMIN_ADDRESSES = adminKeypair.publicKey();
    redis = new FakeRedisService();

    const moduleRef = await Test.createTestingModule({
      imports: [AuthModule],
      controllers: [ProtectedController],
    })
      // Keep the real ioredis client from connecting during tests.
      .overrideProvider(REDIS_CLIENT)
      .useValue({})
      .overrideProvider(RedisService)
      .useValue(redis)
      .overrideProvider(getRepositoryToken(User))
      .useValue({
        findOne: ({
          where: { walletAddress },
        }: {
          where: { walletAddress: string };
        }) => users.get(walletAddress) ?? null,
        query: (_sql: string, [walletAddress]: [string]) => {
          const user = users.get(walletAddress);
          users.set(walletAddress, {
            walletAddress,
            tokenVersion: (user?.tokenVersion ?? 0) + 1,
          });
        },
      })
      .overrideProvider(getRepositoryToken(UserSuspension))
      .useValue({
        findOne: jest.fn().mockResolvedValue(null),
        save: jest.fn(),
      })
      .overrideProvider(getRepositoryToken(AuditLog))
      .useValue({
        create: jest.fn((v: unknown) => v),
        save: jest.fn().mockResolvedValue(undefined),
      })
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(createValidationPipe());
    app.useGlobalFilters(new AllExceptionsFilter(true));
    await app.init();
  });

  beforeEach(() => {
    redis.reset();
    users.clear();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  async function login(kp: Keypair = keypair) {
    const address = kp.publicKey();
    const nonce = await request(app.getHttpServer())
      .post('/auth/nonce')
      .send({ address })
      .expect(200);
    const signature = kp
      .sign(Buffer.from(nonce.body.message))
      .toString('base64');
    expect(nonce.body.message).toBe(loginMessage(address, nonce.body.nonce));
    return request(app.getHttpServer())
      .post('/auth/login')
      .send({ address, signature });
  }

  it('rejects malformed addresses with field errors', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/nonce')
      .send({ address: 'nope' })
      .expect(400);
    expect(res.body).toMatchObject({
      code: 'VALIDATION_FAILED',
      errors: [{ field: 'address' }],
    });
  });

  it('issues an expiring path-based nonce and validates the wallet address', async () => {
    const address = Keypair.random().publicKey();
    const response = await request(app.getHttpServer())
      .get(`/auth/nonce/${address}`)
      .expect(200);
    expect(response.body.nonce).toMatch(/^[a-f0-9]{64}$/);
    expect(Number.isNaN(Date.parse(response.body.expiresAt))).toBe(false);

    await request(app.getHttpServer())
      .get('/auth/nonce/not-a-wallet')
      .expect(400);
  });

  it('runs the full wallet login, protected access, refresh and logout flow', async () => {
    const res = await login();
    expect(res.status).toBe(200);
    const { accessToken, refreshToken } = res.body;

    await request(app.getHttpServer()).get('/protected').expect(401);
    await request(app.getHttpServer())
      .get('/protected')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(200);
    await request(app.getHttpServer())
      .get('/protected/admin')
      .set('Authorization', `Bearer ${accessToken}`)
      .expect(403);
    await request(app.getHttpServer())
      .get('/protected')
      .set('Authorization', `Bearer ${refreshToken}`)
      .expect(401);

    const refreshed = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken })
      .expect(200);
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken })
      .expect(401);

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${refreshed.body.accessToken}`)
      .send({ refreshToken: refreshed.body.refreshToken })
      .expect(204);
    await request(app.getHttpServer())
      .get('/protected')
      .set('Authorization', `Bearer ${refreshed.body.accessToken}`)
      .expect(401);
  });

  it('rejects a bad signature with INVALID_CREDENTIALS', async () => {
    const address = keypair.publicKey();
    await request(app.getHttpServer())
      .post('/auth/nonce')
      .send({ address })
      .expect(200);
    const bad = Buffer.alloc(64, 1).toString('base64');
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ address, signature: bad })
      .expect(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('rejects a login once the nonce TTL has elapsed', async () => {
    const address = keypair.publicKey();
    const nonce = await request(app.getHttpServer())
      .post('/auth/nonce')
      .send({ address })
      .expect(200);
    const signature = keypair
      .sign(Buffer.from(nonce.body.message))
      .toString('base64');

    redis.advance(3_000);

    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ address, signature })
      .expect(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('refuses to replay a consumed nonce', async () => {
    const address = keypair.publicKey();
    const nonce = await request(app.getHttpServer())
      .post('/auth/nonce')
      .send({ address })
      .expect(200);
    const signature = keypair
      .sign(Buffer.from(nonce.body.message))
      .toString('base64');

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ address, signature })
      .expect(200);
    const replay = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ address, signature })
      .expect(401);
    expect(replay.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('uses mocked Stellar verification for deterministic failures', async () => {
    const address = keypair.publicKey();
    const nonce = await request(app.getHttpServer())
      .post('/auth/nonce')
      .send({ address })
      .expect(200);
    const signature = keypair
      .sign(Buffer.from(nonce.body.message))
      .toString('base64');
    const verify = jest
      .spyOn(Keypair, 'fromPublicKey')
      .mockReturnValue({ verify: () => false } as never);

    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ address, signature })
      .expect(401);

    expect(verify).toHaveBeenCalled();
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });

  it('grants admin-only access to configured wallet addresses', async () => {
    const res = await login(adminKeypair);
    expect(res.status).toBe(200);

    await request(app.getHttpServer())
      .get('/protected/admin')
      .set('Authorization', `Bearer ${res.body.accessToken}`)
      .expect(200);
  });

  it('rotates refresh tokens and rejects malformed refresh payloads', async () => {
    const first = await login();
    const refreshed = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: first.body.refreshToken })
      .expect(200);

    expect(refreshed.body.refreshToken).not.toBe(first.body.refreshToken);
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: first.body.refreshToken })
      .expect(401);
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: 'not-a-jwt' })
      .expect(400);

    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: refreshed.body.refreshToken })
      .expect(200);
  });

  it('blacklists the logged-out access token without revoking someone else session', async () => {
    const mine = await login();
    const theirs = await login(adminKeypair);

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${mine.body.accessToken}`)
      .send({ refreshToken: mine.body.refreshToken })
      .expect(204);

    await request(app.getHttpServer())
      .get('/protected')
      .set('Authorization', `Bearer ${mine.body.accessToken}`)
      .expect(401);
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: mine.body.refreshToken })
      .expect(401);
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: theirs.body.refreshToken })
      .expect(200);
  });

  it('revokes all of the caller’s refresh tokens and invalidates their access tokens', async () => {
    await request(app.getHttpServer()).post('/auth/revoke-all').expect(401);
    const first = await login();
    const second = await login();

    const response = await request(app.getHttpServer())
      .post('/auth/revoke-all')
      .set('Authorization', `Bearer ${first.body.accessToken}`)
      .expect(200);

    expect(response.body).toMatchObject({ revokedCount: 2 });
    await request(app.getHttpServer())
      .get('/protected')
      .set('Authorization', `Bearer ${second.body.accessToken}`)
      .expect(401);
    await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: second.body.refreshToken })
      .expect(401);
  });

  it('allows admins to revoke another user’s sessions and limits requests per caller', async () => {
    const admin = await login(adminKeypair);
    const target = await login(keypair);
    const endpoint = `/auth/admin/revoke-all/${keypair.publicKey()}`;

    const revoked = await request(app.getHttpServer())
      .post(endpoint)
      .set('Authorization', `Bearer ${admin.body.accessToken}`)
      .expect(200);
    expect(revoked.body.revokedCount).toBe(1);
    await request(app.getHttpServer())
      .get('/protected')
      .set('Authorization', `Bearer ${target.body.accessToken}`)
      .expect(401);

    await request(app.getHttpServer())
      .post('/auth/admin/revoke-all/invalid')
      .set('Authorization', `Bearer ${admin.body.accessToken}`)
      .expect(400);

    for (let i = 0; i < 2; i++) {
      await request(app.getHttpServer())
        .post(`/auth/admin/revoke-all/${keypair.publicKey()}`)
        .set('Authorization', `Bearer ${admin.body.accessToken}`)
        .expect(200);
    }
    await request(app.getHttpServer())
      .post(`/auth/admin/revoke-all/${keypair.publicKey()}`)
      .set('Authorization', `Bearer ${admin.body.accessToken}`)
      .expect(429);
  });

  it('does not allow a regular user to use the admin revocation endpoint', async () => {
    const user = await login();
    await request(app.getHttpServer())
      .post(`/auth/admin/revoke-all/${adminKeypair.publicKey()}`)
      .set('Authorization', `Bearer ${user.body.accessToken}`)
      .expect(403);
  });
});
