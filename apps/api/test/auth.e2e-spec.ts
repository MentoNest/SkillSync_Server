import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';
import * as jwt from 'jsonwebtoken';

describe('Authentication E2E', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;

  const testUser = {
    email: 'test@example.com',
    password: 'SecurePass123!',
    firstName: 'John',
    lastName: 'Doe',
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);
  });

  beforeEach(async () => {
    // Clean up users table before each test
    await dataSource.query(`DELETE FROM users WHERE email = $1`, [
      testUser.email,
    ]);
  });

  afterAll(async () => {
    // Clean up after all tests
    await dataSource.query(`DELETE FROM users WHERE email = $1`, [
      testUser.email,
    ]);
    await app.close();
  });

  describe('/auth/register (POST)', () => {
    it('should successfully register a new user', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(testUser)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('email', testUser.email);
      expect(response.body).toHaveProperty('firstName', testUser.firstName);
      expect(response.body).toHaveProperty('lastName', testUser.lastName);
      expect(response.body).toHaveProperty('tokens');
      expect(response.body.tokens).toHaveProperty('accessToken');
      expect(response.body.tokens).toHaveProperty('refreshToken');

      // Verify tokens are valid JWT
      expect(response.body.tokens.accessToken).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
      expect(response.body.tokens.refreshToken).toMatch(/^[\w-]+\.[\w-]+\.[\w-]+$/);
    });

    it('should fail when registering with duplicate email', async () => {
      // First registration
      await request(app.getHttpServer())
        .post('/auth/register')
        .send(testUser)
        .expect(201);

      // Second registration with same email
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(testUser)
        .expect(409);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('already exists');
    });

    it('should fail with invalid email format', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          ...testUser,
          email: 'invalid-email',
        })
        .expect(400);

      expect(response.body).toHaveProperty('message');
    });

    it('should fail with password less than 8 characters', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          ...testUser,
          password: 'Short1!',
        })
        .expect(400);

      expect(response.body).toHaveProperty('message');
    });

    it('should fail with missing required fields', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send({
          email: testUser.email,
          password: testUser.password,
          // Missing firstName and lastName
        })
        .expect(400);

      expect(response.body).toHaveProperty('message');
    });

    it('should hash password (not store plain text)', async () => {
      await request(app.getHttpServer())
        .post('/auth/register')
        .send(testUser)
        .expect(201);

      const userInDb = await dataSource.query(
        `SELECT password_hash FROM users WHERE email = $1`,
        [testUser.email],
      );

      expect(userInDb[0].password_hash).toBeDefined();
      expect(userInDb[0].password_hash).not.toBe(testUser.password);
      expect(userInDb[0].password_hash).toMatch(/^\$2[aby]\$\d+\$/); // bcrypt hash pattern
    });

    it('should return tokens with correct claims', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/register')
        .send(testUser)
        .expect(201);

      const accessToken = response.body.tokens.accessToken;
      const refreshToken = response.body.tokens.refreshToken;

      // Decode without verifying (we'll verify in the actual app)
      const accessPayload = jwt.decode(accessToken) as any;
      const refreshPayload = jwt.decode(refreshToken) as any;

      // Access token claims
      expect(accessPayload).toHaveProperty('sub', response.body.id);
      expect(accessPayload).toHaveProperty('email', testUser.email);
      expect(accessPayload).toHaveProperty('type', 'access');
      expect(accessPayload).toHaveProperty('exp');

      // Refresh token claims
      expect(refreshPayload).toHaveProperty('sub', response.body.id);
      expect(refreshPayload).toHaveProperty('email', testUser.email);
      expect(refreshPayload).toHaveProperty('type', 'refresh');
      expect(refreshPayload).toHaveProperty('exp');
    });
  });

  describe('/auth/login (POST)', () => {
    beforeEach(async () => {
      // Register a user before each login test
      await request(app.getHttpServer())
        .post('/auth/register')
        .send(testUser);
    });

    it('should successfully login with valid credentials', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        })
        .expect(200);

      expect(response.body).toHaveProperty('id');
      expect(response.body).toHaveProperty('email', testUser.email);
      expect(response.body).toHaveProperty('firstName', testUser.firstName);
      expect(response.body).toHaveProperty('lastName', testUser.lastName);
      expect(response.body).toHaveProperty('tokens');
      expect(response.body.tokens).toHaveProperty('accessToken');
      expect(response.body.tokens).toHaveProperty('refreshToken');
    });

    it('should fail with non-existent email', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'nonexistent@example.com',
          password: testUser.password,
        })
        .expect(401);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('Invalid email or password');
    });

    it('should fail with incorrect password', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: testUser.email,
          password: 'WrongPassword123!',
        })
        .expect(401);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('Invalid email or password');
    });

    it('should fail with invalid email format', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: 'invalid-email',
          password: testUser.password,
        })
        .expect(400);

      expect(response.body).toHaveProperty('message');
    });

    it('should fail with missing credentials', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: testUser.email,
          // Missing password
        })
        .expect(400);

      expect(response.body).toHaveProperty('message');
    });

    it('should fail when user account is inactive', async () => {
      // Deactivate user
      await dataSource.query(
        `UPDATE users SET "isActive" = false WHERE email = $1`,
        [testUser.email],
      );

      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        })
        .expect(401);

      expect(response.body).toHaveProperty('message');
      expect(response.body.message).toContain('inactive');
    });

    it('should generate new tokens on each login', async () => {
      const response1 = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        })
        .expect(200);

      // Wait a tiny bit to ensure different timestamps
      await new Promise((resolve) => setTimeout(resolve, 10));

      const response2 = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        })
        .expect(200);

      expect(response1.body.tokens.accessToken).not.toBe(
        response2.body.tokens.accessToken,
      );
      expect(response1.body.tokens.refreshToken).not.toBe(
        response2.body.tokens.refreshToken,
      );
    });

    it('should return tokens with correct claims', async () => {
      const response = await request(app.getHttpServer())
        .post('/auth/login')
        .send({
          email: testUser.email,
          password: testUser.password,
        })
        .expect(200);

      const accessToken = response.body.tokens.accessToken;
      const refreshToken = response.body.tokens.refreshToken;

      const accessPayload = jwt.decode(accessToken) as any;
      const refreshPayload = jwt.decode(refreshToken) as any;

      // Access token claims
      expect(accessPayload).toHaveProperty('sub', response.body.id);
      expect(accessPayload).toHaveProperty('email', testUser.email);
      expect(accessPayload).toHaveProperty('type', 'access');

      // Refresh token claims
      expect(refreshPayload).toHaveProperty('sub', response.body.id);
      expect(refreshPayload).toHaveProperty('email', testUser.email);
      expect(refreshPayload).toHaveProperty('type', 'refresh');
    });
  });

  describe('Token validation', () => {
    it('should verify access token can be decoded with correct secret', async () => {
      const registerResponse = await request(app.getHttpServer())
        .post('/auth/register')
        .send(testUser)
        .expect(201);

      const accessToken = registerResponse.body.tokens.accessToken;
      const accessSecret = process.env.JWT_ACCESS_SECRET || 'your-super-secret-access-key-change-in-production';

      // This should not throw
      const decoded = jwt.verify(accessToken, accessSecret) as any;
      expect(decoded).toHaveProperty('sub');
      expect(decoded).toHaveProperty('email', testUser.email);
      expect(decoded).toHaveProperty('type', 'access');
    });

    it('should verify refresh token can be decoded with correct secret', async () => {
      const registerResponse = await request(app.getHttpServer())
        .post('/auth/register')
        .send(testUser)
        .expect(201);

      const refreshToken = registerResponse.body.tokens.refreshToken;
      const refreshSecret = process.env.JWT_REFRESH_SECRET || 'your-super-secret-refresh-key-change-in-production';

      // This should not throw
      const decoded = jwt.verify(refreshToken, refreshSecret) as any;
      expect(decoded).toHaveProperty('sub');
      expect(decoded).toHaveProperty('email', testUser.email);
      expect(decoded).toHaveProperty('type', 'refresh');
    });
  });
});
