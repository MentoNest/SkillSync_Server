import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import * as request from 'supertest';
import { AppModule } from '../../app.module';

/**
 * E2E Test for CORS Configuration
 * Tests actual CORS behavior in the running application
 */
describe('CORS Configuration (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('Preflight OPTIONS requests', () => {
    it('should return 204 for successful preflight OPTIONS from allowed origin', async () => {
      // Use a localhost origin since we're in development
      const response = await request(app.getHttpServer())
        .options('/api/health')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'GET')
        .set('Access-Control-Request-Headers', 'Content-Type');

      expect(response.status).toBe(204);
    });

    it('should return CORS headers in preflight response', async () => {
      const response = await request(app.getHttpServer())
        .options('/api/health')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'GET')
        .set('Access-Control-Request-Headers', 'Content-Type');

      expect(response.headers['access-control-allow-origin']).toBeDefined();
      expect(response.headers['access-control-allow-methods']).toBeDefined();
      expect(response.headers['access-control-allow-headers']).toBeDefined();
    });

    it('should allow credentials in CORS headers', async () => {
      const response = await request(app.getHttpServer())
        .options('/api/health')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'GET');

      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    it('should set maxAge for preflight caching', async () => {
      const response = await request(app.getHttpServer())
        .options('/api/health')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'GET');

      expect(response.headers['access-control-max-age']).toBeDefined();
    });
  });

  describe('CORS headers in actual responses', () => {
    it('should include CORS headers in GET response from allowed origin', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/health')
        .set('Origin', 'http://localhost:3000');

      expect(response.status).toBe(200);
      expect(response.headers['access-control-allow-origin']).toBe(
        'http://localhost:3000',
      );
    });

    it('should include access-control-allow-credentials header', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/health')
        .set('Origin', 'http://localhost:3000');

      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });

    it('should expose required response headers', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/health')
        .set('Origin', 'http://localhost:3000');

      const exposedHeaders =
        response.headers['access-control-expose-headers'] || '';
      expect(exposedHeaders).toContain('X-Total-Count');
    });
  });

  describe('Localhost origin support (development)', () => {
    const localhostOrigins = [
      'http://localhost:3000',
      'http://localhost:3001',
      'http://localhost:4200',
      'http://localhost:5173', // Vite
      'http://127.0.0.1:3000',
    ];

    test.each(localhostOrigins)(
      'should allow %s origin in development',
      async (origin) => {
        const response = await request(app.getHttpServer())
          .get('/api/health')
          .set('Origin', origin);

        expect(response.status).toBe(200);
        expect(response.headers['access-control-allow-origin']).toBe(origin);
      },
    );
  });

  describe('Custom headers support', () => {
    it('should allow Authorization header in request', async () => {
      const response = await request(app.getHttpServer())
        .options('/api/health')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'GET')
        .set('Access-Control-Request-Headers', 'Authorization');

      expect(response.status).toBe(204);
      const allowedHeaders =
        response.headers['access-control-allow-headers'] || '';
      expect(allowedHeaders.toLowerCase()).toContain('authorization');
    });

    it('should allow Content-Type header in request', async () => {
      const response = await request(app.getHttpServer())
        .options('/api/health')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'POST')
        .set('Access-Control-Request-Headers', 'Content-Type');

      expect(response.status).toBe(204);
      const allowedHeaders =
        response.headers['access-control-allow-headers'] || '';
      expect(allowedHeaders.toLowerCase()).toContain('content-type');
    });

    it('should allow Accept header in request', async () => {
      const response = await request(app.getHttpServer())
        .options('/api/health')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'GET')
        .set('Access-Control-Request-Headers', 'Accept');

      expect(response.status).toBe(204);
      const allowedHeaders =
        response.headers['access-control-allow-headers'] || '';
      expect(allowedHeaders.toLowerCase()).toContain('accept');
    });
  });

  describe('HTTP methods support', () => {
    const allowedMethods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'];

    test.each(allowedMethods)(
      'should allow %s method in preflight',
      async (method) => {
        const response = await request(app.getHttpServer())
          .options('/api/health')
          .set('Origin', 'http://localhost:3000')
          .set('Access-Control-Request-Method', method);

        expect(response.status).toBe(204);
      },
    );
  });

  describe('Request without origin header', () => {
    it('should allow requests without origin header (mobile apps, CLI)', async () => {
      const response = await request(app.getHttpServer()).get('/api/health');

      // Should not have CORS headers if no origin sent
      expect(response.status).toBe(200);
    });
  });

  describe('OPTIONS method handling', () => {
    it('should handle OPTIONS preflight correctly', async () => {
      const response = await request(app.getHttpServer())
        .options('/api/health')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'GET');

      expect([200, 204]).toContain(response.status);
    });

    it('should handle OPTIONS request for protected routes', async () => {
      const response = await request(app.getHttpServer())
        .options('/api/users')
        .set('Origin', 'http://localhost:3000')
        .set('Access-Control-Request-Method', 'GET')
        .set('Access-Control-Request-Headers', 'Authorization');

      expect([200, 204]).toContain(response.status);
      expect(response.headers['access-control-allow-headers']).toBeDefined();
    });
  });

  describe('Credentials with cookies', () => {
    it('should allow withCredentials in requests', async () => {
      const response = await request(app.getHttpServer())
        .get('/api/health')
        .set('Origin', 'http://localhost:3000')
        .set('Cookie', 'test=value');

      expect(response.status).toBe(200);
      expect(response.headers['access-control-allow-credentials']).toBe('true');
    });
  });
});
