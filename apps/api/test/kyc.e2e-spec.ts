import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import { User } from '../src/users/entities/user.entity';
import { Kyc, KycStatus } from '../src/verify/entities/kyc.entity';

describe('KYC E2E Tests', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let user: User;
  let authToken: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);

    // Clean up any existing test data
    await dataSource.getRepository(Kyc).delete({});
    await dataSource.getRepository(User).delete({});

    // Create a test user
    user = new User();
    user.email = 'test@example.com';
    user.firstName = 'Test';
    user.lastName = 'User';
    user.avatarUrl = undefined;
    user.isActive = true;

    user = await dataSource.getRepository(User).save(user);

    // In a real scenario, we would need to create a proper JWT token for testing
    // For now, we'll mock authentication
    authToken = 'mock-token';
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(async () => {
    // Clean KYC records after each test
    await dataSource.getRepository(Kyc).delete({});
  });

  describe('GET /verify/kyc/me', () => {
    it('should return default unverified KYC status for authenticated user', async () => {
      return request(app.getHttpServer())
        .get('/verify/kyc/me')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
        .then((response) => {
          expect(response.body).toEqual({
            id: expect.any(String),
            user: {
              id: user.id,
              email: user.email,
              firstName: user.firstName,
              lastName: user.lastName,
              phoneNumber: user.phoneNumber,
              isEmailVerified: user.isEmailVerified,
              isPhoneVerified: user.isPhoneVerified,
              createdAt: expect.any(String),
              updatedAt: expect.any(String),
            },
            status: KycStatus.UNVERIFIED,
            provider: null,
            externalRef: null,
            reason: null,
            updatedBy: null,
            createdAt: expect.any(String),
            updatedAt: expect.any(String),
          });
        });
    });
  });

  describe('PATCH /verify/kyc/:userId', () => {
    it('should allow admin to update user KYC status', async () => {
      // First create a KYC record by fetching user's KYC
      await request(app.getHttpServer())
        .get('/verify/kyc/me')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      // Mock admin token
      const adminToken = 'admin-mock-token';

      return request(app.getHttpServer())
        .patch(`/verify/kyc/${user.id}`)
        .send({
          status: KycStatus.VERIFIED,
          reason: 'Document verified',
          provider: 'mock-provider',
        })
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(200)
        .then((response) => {
          expect(response.body.status).toBe(KycStatus.VERIFIED);
          expect(response.body.reason).toBe('Document verified');
          expect(response.body.provider).toBe('mock-provider');
        });
    });

    it('should return 403 for non-admin users trying to update KYC', async () => {
      return request(app.getHttpServer())
        .patch(`/verify/kyc/${user.id}`)
        .send({
          status: KycStatus.VERIFIED,
        })
        .set('Authorization', `Bearer ${authToken}`)
        .expect(403);
    });
  });

  describe('POST /verify/webhook/kyc', () => {
    it('should update KYC status via webhook', async () => {
      return request(app.getHttpServer())
        .post('/verify/webhook/kyc')
        .send({
          userId: user.id,
          status: KycStatus.VERIFIED,
          provider: 'external-provider',
          externalRef: 'ext-ref-123',
          reason: 'Successfully verified by external provider',
        })
        .expect(200)
        .then((response) => {
          expect(response.body.status).toBe(KycStatus.VERIFIED);
          expect(response.body.provider).toBe('external-provider');
          expect(response.body.externalRef).toBe('ext-ref-123');
          expect(response.body.reason).toBe(
            'Successfully verified by external provider',
          );
        });
    });

    it('should return 400 for invalid status in webhook', async () => {
      return request(app.getHttpServer())
        .post('/verify/webhook/kyc')
        .send({
          userId: user.id,
          status: 'invalid-status',
          provider: 'external-provider',
        })
        .expect(400);
    });
  });
});
