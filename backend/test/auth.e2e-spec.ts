import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { Keypair } from '@stellar/stellar-sdk';
import request from 'supertest';
import { App } from 'supertest/types';
import { AuditService } from '../src/audit/audit.service';
import { AuditEvent } from '../src/audit/entities/audit-log.entity';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { createAppValidationPipe } from '../src/common/pipes/app-validation.pipe';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { RefreshTokenService } from '../src/auth/refresh-token.service';
import { AuthGuardsModule } from '../src/auth/guards/auth-guards.module';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { NonceService, buildLoginMessage } from '../src/auth/nonce.service';
import { SignatureService } from '../src/auth/signature.service';
import { WalletStrategy } from '../src/auth/strategies/wallet.strategy';
import { REDIS } from '../src/redis/redis.module';
import { UsersService } from '../src/users/users.service';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'skillsync-e2e-secret';

describe('Auth API (e2e)', () => {
  let app: INestApplication<App>;
  let fakeUsers: {
    findOrCreateByWallet: jest.Mock;
    recordLogin: jest.Mock;
  };
  let fakeRefresh: { issuePair: jest.Mock; rotate: jest.Mock };
  let fakeAudit: { record: jest.Mock };

  const keypair = Keypair.random();
  const wallet = keypair.publicKey();
  const sign = (w: string, n: string): string =>
    keypair.sign(Buffer.from(buildLoginMessage(w, n), 'utf8')).toString('base64');

  beforeAll(async () => {
    const nonceStore = new Map<string, string>();
    const fakeRedis = {
      set: jest.fn(async (key: string, value: string) => {
        nonceStore.set(key, value);
        return 'OK';
      }),
      getdel: jest.fn(async (key: string) => {
        const value = nonceStore.get(key) ?? null;
        nonceStore.delete(key);
        return value;
      }),
    };
    fakeUsers = {
      findOrCreateByWallet: jest.fn(),
      recordLogin: jest.fn(),
    };
    fakeUsers.findOrCreateByWallet.mockImplementation(async (dto: { walletAddress: string }) => ({
      id: 'u1',
      walletAddress: dto.walletAddress,
      tokenVersion: 0,
      roles: [],
    }));
    fakeUsers.recordLogin.mockResolvedValue(undefined);
    fakeRefresh = { issuePair: jest.fn(), rotate: jest.fn() };
    fakeRefresh.issuePair.mockResolvedValue({
      accessToken: 'e2e-access',
      refreshToken: 'e2e-refresh',
      expiresIn: 900,
    });
    fakeRefresh.rotate.mockResolvedValue({
      accessToken: 'e2e-access',
      refreshToken: 'e2e-refresh',
      expiresIn: 900,
    });
    fakeAudit = { record: jest.fn().mockResolvedValue(undefined) };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), AuthGuardsModule],
      controllers: [AuthController],
      providers: [
        AuthService,
        NonceService,
        SignatureService,
        WalletStrategy,
        { provide: UsersService, useValue: fakeUsers },
        { provide: RefreshTokenService, useValue: fakeRefresh },
        { provide: AuditService, useValue: fakeAudit },
        { provide: REDIS, useValue: fakeRedis },
        { provide: APP_GUARD, useExisting: JwtAuthGuard },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
        { provide: APP_PIPE, useValue: createAppValidationPipe() },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('issues a nonce on a public route even with the global guard enabled', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/nonce')
      .send({ walletAddress: wallet.toLowerCase() })
      .expect(200);
    expect(res.body.nonce).toMatch(/^[0-9a-f]{64}$/);
    expect(res.body.message).toContain(wallet.toUpperCase());
    expect(res.body.message).toContain(res.body.nonce);
    expect(typeof res.body.expiresAt).toBe('string');
  });

  it('validates the nonce request payload', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/nonce')
      .send({ walletAddress: 'not-a-wallet' })
      .expect(400);
    expect(res.body.code).toBe('E_VALIDATION_ERROR');
    expect(res.body.details).toEqual([expect.objectContaining({ field: 'walletAddress' })]);
  });

  it('logs in with a valid wallet signature', async () => {
    const nonceRes = await request(app.getHttpServer())
      .post('/auth/nonce')
      .send({ walletAddress: wallet.toLowerCase() })
      .expect(200);
    const nonce = nonceRes.body.nonce as string;

    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ walletAddress: wallet.toLowerCase(), nonce, signature: sign(wallet.toUpperCase(), nonce) })
      .expect(200);
    expect(res.body).toEqual({
      accessToken: 'e2e-access',
      refreshToken: 'e2e-refresh',
      expiresIn: 900,
    });
    expect(fakeUsers.findOrCreateByWallet).toHaveBeenCalledWith({ walletAddress: wallet.toUpperCase() });
    expect(fakeAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({ event: AuditEvent.LOGIN_SUCCESS, userId: 'u1' }),
    );
  });

  it('rejects a bad signature and records a failure audit entry', async () => {
    const nonceRes = await request(app.getHttpServer())
      .post('/auth/nonce')
      .send({ walletAddress: wallet.toLowerCase() })
      .expect(200);
    const nonce = nonceRes.body.nonce as string;
    const impostor = Keypair.random().sign(
      Buffer.from(buildLoginMessage(wallet.toUpperCase(), nonce), 'utf8'),
    );

    fakeAudit.record.mockClear();
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ walletAddress: wallet.toLowerCase(), nonce, signature: impostor.toString('base64') })
      .expect(401);
    expect(res.body.statusCode).toBe(401);
    expect(fakeAudit.record).toHaveBeenCalledWith(
      expect.objectContaining({ event: AuditEvent.LOGIN_FAILURE }),
    );
  });

  it('rejects a replayed nonce', async () => {
    const nonceRes = await request(app.getHttpServer())
      .post('/auth/nonce')
      .send({ walletAddress: wallet.toLowerCase() })
      .expect(200);
    const nonce = nonceRes.body.nonce as string;
    const signature = sign(wallet.toUpperCase(), nonce);

    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ walletAddress: wallet.toLowerCase(), nonce, signature })
      .expect(200);

    const replay = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ walletAddress: wallet.toLowerCase(), nonce, signature })
      .expect(401);
    expect(replay.body.message).toBe('Invalid or expired nonce');
  });

  it('rotates a refresh token', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: 'raw-refresh' })
      .expect(200);
    expect(res.body.accessToken).toBe('e2e-access');
    expect(fakeRefresh.rotate).toHaveBeenCalledWith('raw-refresh', expect.anything());
  });

  it('validates the refresh payload', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({})
      .expect(400);
    expect(res.body.details).toEqual([expect.objectContaining({ field: 'refreshToken' })]);
  });
});
