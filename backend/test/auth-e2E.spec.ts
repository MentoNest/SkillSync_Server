import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import Redis from 'ioredis';
import { AppModule } from '../src/app.module';

// Use standard text formatting for units/numbers
// Targeted execution threshold: suite execution time < 30 seconds
describe('Authentication Module (E2E)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let redisClient: Redis;

  // Mock definitions for deterministic wallet testing
  const mockStellarAddress = 'GBBD47IF267D76ZALCOY7A3ALBN37M3Z67T67W66T2ALCOY7A3ALBN37';
  const validMockSignature = 'BASE64_VALID_STELLAR_SIGNATURE_MOCK_DATA';
  const invalidMockSignature = 'BASE64_INVALID_SIGNATURE';

  beforeAll(async () => {
    // 1. Initialize testing application context with environment overrides
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    })
      .overrideProvider('STELLAR_VERIFICATION_SERVICE')
      .useValue({
        // Detach live chain calls; enforce deterministic behavior rules
        verifySignature: jest.fn().mockImplementation((address, nonce, signature) => {
          if (signature === invalidMockSignature) return false;
          if (nonce === 'EXPIRED_NONCE_VALUE') return false;
          return address === mockStellarAddress;
        }),
      })
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);
    redisClient = moduleFixture.get<Redis>('REDIS_CLIENT');
  });

  afterAll(async () => {
    await dataSource.destroy();
    await redisClient.quit();
    await app.close();
  });

  beforeEach(async () => {
    // 2. Guarantee strict test database reset state isolation between runs
    const entities = dataSource.entityMetadatas;
    for (const entity of entities) {
      const repository = dataSource.getRepository(entity.name);
      await repository.query(`TRUNCATE "${entity.tableName}" CASCADE;`);
    }
    // Flush the Redis instance safely
    await redisClient.flushall();
  });

  describe('POST /v2/auth/nonce', () => {
    it('should generate a unique challenge nonce for an active wallet address', async () => {
      const response = await request(app.getHttpServer())
        .post('/v2/auth/nonce')
        .send({ address: mockStellarAddress })
        .expect(HttpStatus.CREATED);

      expect(response.body).toHaveProperty('nonce');
      expect(typeof response.body.nonce).toBe('string');
    });
  });

  describe('POST /v2/auth/login', () => {
    it('should authenticate successfully with a valid signature challenge match', async () => {
      // Step A: Request valid nonce
      const nonceRes = await request(app.getHttpServer())
        .post('/v2/auth/nonce')
        .send({ address: mockStellarAddress });
      const nonce = nonceRes.body.nonce;

      // Step B: Submit matching signature assertion mapping
      const response = await request(app.getHttpServer())
        .post('/v2/auth/login')
        .send({ address: mockStellarAddress, nonce, signature: validMockSignature })
        .expect(HttpStatus.OK);

      expect(response.body).toHaveProperty('accessToken');
      expect(response.body).toHaveProperty('refreshToken');
    });

    it('should reject login attempts with an invalid signature pattern', async () => {
      await request(app.getHttpServer())
        .post('/v2/auth/login')
        .send({ address: mockStellarAddress, nonce: 'SOME_NONCE', signature: invalidMockSignature })
        .expect(HttpStatus.UNAUTHORIZED);
    });

    it('should fail authentication if the nonce has expired', async () => {
      await request(app.getHttpServer())
        .post('/v2/auth/login')
        .send({ address: mockStellarAddress, nonce: 'EXPIRED_NONCE_VALUE', signature: validMockSignature })
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('POST /v2/auth/refresh', () => {
    it('should rotate access tokens safely using a valid refresh token', async () => {
      const nonceRes = await request(app.getHttpServer()).post('/v2/auth/nonce').send({ address: mockStellarAddress });
      const loginRes = await request(app.getHttpServer())
        .post('/v2/auth/login')
        .send({ address: mockStellarAddress, nonce: nonceRes.body.nonce, signature: validMockSignature });

      const { refreshToken } = loginRes.body;

      const response = await request(app.getHttpServer())
        .post('/v2/auth/refresh')
        .send({ refreshToken })
        .expect(HttpStatus.OK);

      expect(response.body).toHaveProperty('accessToken');
    });
  });

  describe('POST /v2/auth/logout & Session Revocation', () => {
    it('should invalidate active tokens and append them to the blacklist on logout', async () => {
      const nonceRes = await request(app.getHttpServer()).post('/v2/auth/nonce').send({ address: mockStellarAddress });
      const loginRes = await request(app.getHttpServer())
        .post('/v2/auth/login')
        .send({ address: mockStellarAddress, nonce: nonceRes.body.nonce, signature: validMockSignature });

      const { accessToken } = loginRes.body;

      // Execute revocation logout call
      await request(app.getHttpServer())
        .post('/v2/auth/logout')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.OK);

      // Verify token blacklist works by attempting to reuse the exact same token immediately
      await request(app.getHttpServer())
        .get('/v2/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(HttpStatus.UNAUTHORIZED);
    });
  });

  describe('Rate Limiting & Time Manipulation Control', () => {
    it('should trigger standard 429 exceptions on heavy execution point bursts', async () => {
      // Use Jest time distortion configuration controls to lock and slide testing limits manually
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2026-06-27T08:00:00.000Z'));

      const burstRequests = Array.from({ length: 15 }).map(() => {
        return request(app.getHttpServer())
          .post('/v2/auth/nonce')
          .send({ address: mockStellarAddress });
      });

      const responses = await Promise.all(burstRequests);
      const hitLimit = responses.some(res => res.status === HttpStatus.TOO_MANY_REQUESTS);
      
      expect(hitLimit).toBe(true);

      // Advance clock windows manually to confirm automatic rate-limiter recovery operations
      jest.advanceTimersByTime(60000); // Step forward 60 seconds
      
      await request(app.getHttpServer())
        .post('/v2/auth/nonce')
        .send({ address: mockStellarAddress })
        .expect(HttpStatus.CREATED);

      jest.useRealTimers();
    });
  });
});