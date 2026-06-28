import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule } from '@nestjs/config';
import * as request from 'supertest';
import { AuthController } from '../../auth.controller';
import { AuthService } from '../../auth.service';
import { RedisService } from '../../redis/redis.service';
import { AuditLogService } from '../audit-log.service';

const JWT_SECRET = 'e2e-test-secret';

const mockRedis = {
  set: jest.fn(),
  get: jest.fn(),
  del: jest.fn(),
  getClient: jest.fn(() => ({ get: jest.fn().mockResolvedValue(null), incr: jest.fn(), set: jest.fn() })),
};
const mockAudit = { logAttempt: jest.fn(), logEvent: jest.fn() };
const mockUserSvc = { findOrCreateByWallet: jest.fn() };
const mockLoginAttempt = { incrementAttempts: jest.fn(), resetAttempts: jest.fn() };
const mockSuspiciousLogin = {
  recordFailedAttempt: jest.fn(),
  checkSuspicious: jest.fn(),
  recordSuccessfulLogin: jest.fn(),
};
const mockSuspiciousActivity = { isLockedDown: jest.fn().mockResolvedValue(false), trackFailedAttempt: jest.fn(), lockdownTtl: jest.fn() };
const mockRefreshToken = {
  createRefreshToken: jest.fn(),
  validateRefreshToken: jest.fn(),
  rotateRefreshToken: jest.fn(),
  revokeAllUserTokens: jest.fn(),
};
const mockThrottler = { canActivate: jest.fn().mockReturnValue(true) };

describe('Auth endpoints (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef: TestingModule = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({ isGlobal: true }),
        JwtModule.register({ secret: JWT_SECRET, signOptions: { expiresIn: '15m' } }),
      ],
      controllers: [AuthController],
      providers: [
        AuthService,
        { provide: RedisService, useValue: mockRedis },
        { provide: AuditLogService, useValue: mockAudit },
        { provide: 'UserService', useValue: mockUserSvc },
        { provide: 'LoginAttemptService', useValue: mockLoginAttempt },
        { provide: 'SuspiciousLoginService', useValue: mockSuspiciousLogin },
        { provide: 'SuspiciousActivityService', useValue: mockSuspiciousActivity },
        { provide: 'RefreshTokenService', useValue: mockRefreshToken },
      ],
    })
      .overrideGuard('ThrottlerGuard')
      .useValue(mockThrottler)
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => jest.clearAllMocks());

  describe('GET /auth/nonce/:walletAddress', () => {
    it('400 for invalid wallet address', async () => {
      await request(app.getHttpServer())
        .get('/auth/nonce/not-a-valid-key')
        .expect(400);
    });
  });

  describe('POST /auth/login', () => {
    it('400 for missing body fields', async () => {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({})
        .expect(400);
    });
  });

  describe('POST /auth/refresh', () => {
    it('400 when refreshToken is absent', async () => {
      await request(app.getHttpServer())
        .post('/auth/refresh')
        .send({})
        .expect(400);
    });
  });
});
