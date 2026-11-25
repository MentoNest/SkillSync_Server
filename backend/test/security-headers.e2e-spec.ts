import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Security Headers (e2e)', () => {
  let app: INestApplication;
  const originalEnv = process.env.NODE_ENV;

  afterEach(async () => {
    process.env.NODE_ENV = originalEnv;
    if (app) {
      await app.close();
    }
  });

  it('should include all required security headers in responses (development mode)', async () => {
    process.env.NODE_ENV = 'development';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    const response = await request(app.getHttpServer()).get('/');
    expect(response.status).toBe(200);

    // X-Frame-Options: DENY
    expect(response.headers['x-frame-options']).toBe('DENY');

    // X-Content-Type-Options: nosniff
    expect(response.headers['x-content-type-options']).toBe('nosniff');

    // X-XSS-Protection: 1; mode=block
    expect(response.headers['x-xss-protection']).toBe('1; mode=block');

    // X-Powered-By removed
    expect(response.headers['x-powered-by']).toBeUndefined();

    // Content-Security-Policy present
    expect(response.headers['content-security-policy']).toBeDefined();

    // HSTS disabled in development
    expect(response.headers['strict-transport-security']).toBeUndefined();
  });

  it('should include HSTS in production mode', async () => {
    process.env.NODE_ENV = 'production';
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    const response = await request(app.getHttpServer()).get('/');
    expect(response.status).toBe(200);

    // HSTS enabled in production with max-age 31536000
    expect(response.headers['strict-transport-security']).toContain(
      'max-age=31536000',
    );
  });
});
