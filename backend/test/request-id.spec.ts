import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../app.module';
import {
  generateRequestId,
  extractOrGenerateRequestId,
  setRequestIdHeader,
  getContextRequestId,
  isValidRequestId,
  formatRequestIdForDatabase,
  createDatabaseComment,
  createCorrelationHeaders,
} from '../common/utils/request-id.util';
import {
  getRequestContext,
  getRequestId,
  runWithRequestContext,
  runWithRequestContextAsync,
  requestContextStorage,
} from '../common/contexts/request-id.context';
import { Request, Response } from 'express';

describe('Request ID Generation and Propagation (E2E)', () => {
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

  // ─────────────────────────────────────────────────────────────────────────
  // Section 1: Request ID Generation
  // ─────────────────────────────────────────────────────────────────────────

  describe('Request ID Generation', () => {
    it('should generate a valid UUID v4 request ID', () => {
      const requestId = generateRequestId();
      expect(isValidRequestId(requestId)).toBe(true);
    });

    it('should generate unique request IDs', () => {
      const id1 = generateRequestId();
      const id2 = generateRequestId();
      const id3 = generateRequestId();

      expect(id1).not.toEqual(id2);
      expect(id2).not.toEqual(id3);
      expect(id1).not.toEqual(id3);
    });

    it('should validate correct UUID v4 format', () => {
      const validUUID = generateRequestId();
      expect(isValidRequestId(validUUID)).toBe(true);
    });

    it('should reject invalid UUID formats', () => {
      expect(isValidRequestId('not-a-uuid')).toBe(false);
      expect(isValidRequestId('12345678-1234-1234-1234-123456789012')).toBe(
        false,
      );
      expect(isValidRequestId('12345678-1234-3234-1234-123456789012')).toBe(
        false,
      );
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Section 2: Request ID Extraction from Headers
  // ─────────────────────────────────────────────────────────────────────────

  describe('Request ID Extraction', () => {
    it('should extract request ID from X-Request-Id header', () => {
      const testId = generateRequestId();
      const mockRequest = {
        headers: {
          'x-request-id': testId,
        },
      } as unknown as Request;

      const extracted = extractOrGenerateRequestId(mockRequest);
      expect(extracted).toEqual(testId);
    });

    it('should extract request ID from array headers', () => {
      const testId = generateRequestId();
      const mockRequest = {
        headers: {
          'x-request-id': [testId],
        },
      } as unknown as Request;

      const extracted = extractOrGenerateRequestId(mockRequest);
      expect(extracted).toEqual(testId);
    });

    it('should generate new request ID if header is missing', () => {
      const mockRequest = {
        headers: {},
      } as unknown as Request;

      const extracted = extractOrGenerateRequestId(mockRequest);
      expect(isValidRequestId(extracted)).toBe(true);
    });

    it('should handle empty array headers', () => {
      const mockRequest = {
        headers: {
          'x-request-id': [],
        },
      } as unknown as Request;

      const extracted = extractOrGenerateRequestId(mockRequest);
      expect(isValidRequestId(extracted)).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Section 3: Request ID Header Setting
  // ─────────────────────────────────────────────────────────────────────────

  describe('Request ID Header Setting', () => {
    it('should set X-Request-Id header in response', () => {
      const testId = generateRequestId();
      const mockResponse = {
        headers: {},
        setHeader: function (key: string, value: string) {
          this.headers[key] = value;
        },
      } as unknown as Response;

      setRequestIdHeader(mockResponse, testId);
      expect(mockResponse.headers['X-Request-Id']).toEqual(testId);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Section 4: Request Context Storage
  // ─────────────────────────────────────────────────────────────────────────

  describe('Request Context Storage', () => {
    it('should store and retrieve request context', () => {
      const testId = generateRequestId();
      const context = { requestId: testId };

      const result = runWithRequestContext(context, () => {
        return getRequestContext();
      });

      expect(result).toEqual(context);
    });

    it('should return undefined outside request context', () => {
      const result = getRequestContext();
      expect(result).toBeUndefined();
    });

    it('should handle async context correctly', async () => {
      const testId = generateRequestId();
      const context = { requestId: testId };

      const result = await runWithRequestContextAsync(context, async () => {
        return getRequestId();
      });

      expect(result).toEqual(testId);
    });

    it('should isolate context between concurrent requests', (done) => {
      const id1 = generateRequestId();
      const id2 = generateRequestId();

      let result1: string | undefined;
      let result2: string | undefined;

      // Start first async operation
      runWithRequestContextAsync({ requestId: id1 }, async () => {
        await new Promise((resolve) => setTimeout(resolve, 10));
        result1 = getRequestId();
      }).catch(() => {
        /* Ignore */
      });

      // Start second async operation immediately after
      runWithRequestContextAsync({ requestId: id2 }, async () => {
        result2 = getRequestId();
      }).catch(() => {
        /* Ignore */
      });

      // Allow async operations to complete
      setTimeout(() => {
        expect(result1).toEqual(id1);
        expect(result2).toEqual(id2);
        done();
      }, 50);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Section 5: Database Formatting
  // ─────────────────────────────────────────────────────────────────────────

  describe('Database Request ID Formatting', () => {
    it('should format request ID for database use', () => {
      const testId = generateRequestId();
      const formatted = formatRequestIdForDatabase(testId);

      expect(formatted).toMatch(/^req_[a-f0-9]+$/);
      expect(formatted.length).toBeLessThanOrEqual(63);
    });

    it('should remove dashes from request ID', () => {
      const testId = generateRequestId();
      const formatted = formatRequestIdForDatabase(testId);

      expect(formatted).not.toContain('-');
    });

    it('should create valid SQL comment with request ID', () => {
      const testId = generateRequestId();
      const comment = createDatabaseComment(testId);

      expect(comment).toContain('-- Request-ID:');
      expect(comment).toContain(testId);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Section 6: Correlation Headers for External Services
  // ─────────────────────────────────────────────────────────────────────────

  describe('Correlation Headers', () => {
    it('should create correlation headers with request ID', () => {
      const testId = generateRequestId();
      const headers = createCorrelationHeaders(testId);

      expect(headers['X-Request-Id']).toEqual(testId);
      expect(headers['X-Correlation-Id']).toEqual(testId);
      expect(headers['Traceparent']).toBeDefined();
    });

    it('should create valid W3C Trace Context header', () => {
      const testId = generateRequestId();
      const headers = createCorrelationHeaders(testId);
      const traceparent = headers['Traceparent'];

      // Format: 00-traceid-spanid-01
      const parts = traceparent.split('-');
      expect(parts.length).toBe(4);
      expect(parts[0]).toBe('00');
      expect(parts[3]).toBe('01');
      expect(parts[1].length).toBe(32); // 128-bit trace ID
      expect(parts[2].length).toBe(16); // 64-bit span ID
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Section 7: E2E HTTP Tests with Request ID
  // ─────────────────────────────────────────────────────────────────────────

  describe('HTTP Request/Response with Request ID (E2E)', () => {
    it('should return X-Request-Id header in response', async () => {
      const testId = generateRequestId();

      const response = await request(app.getHttpServer())
        .get('/api/v1/health')
        .set('X-Request-Id', testId);

      expect(response.headers['x-request-id']).toEqual(testId);
    });

    it('should generate request ID if not provided', async () => {
      const response = await request(app.getHttpServer()).get('/api/v1/health');

      expect(response.headers['x-request-id']).toBeDefined();
      expect(isValidRequestId(response.headers['x-request-id'])).toBe(true);
    });

    it('should include requestId in response body', async () => {
      const testId = generateRequestId();

      const response = await request(app.getHttpServer())
        .get('/api/v1/health')
        .set('X-Request-Id', testId);

      expect(response.body.requestId).toEqual(testId);
    });

    it('should include requestId in error responses', async () => {
      const testId = generateRequestId();

      const response = await request(app.getHttpServer())
        .post('/api/v1/auth/login')
        .set('X-Request-Id', testId)
        .send({ email: '', password: '' });

      expect(response.body.requestId).toBeDefined();
      expect(isValidRequestId(response.body.requestId)).toBe(true);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // Section 8: Performance Tests
  // ─────────────────────────────────────────────────────────────────────────

  describe('Performance', () => {
    it('should generate request ID in less than 1ms', () => {
      const start = process.hrtime.bigint();
      generateRequestId();
      const end = process.hrtime.bigint();

      const durationMs = Number(end - start) / 1_000_000;
      expect(durationMs).toBeLessThan(1);
    });

    it('should extract request ID in less than 1ms', () => {
      const mockRequest = {
        headers: { 'x-request-id': generateRequestId() },
      } as unknown as Request;

      const start = process.hrtime.bigint();
      extractOrGenerateRequestId(mockRequest);
      const end = process.hrtime.bigint();

      const durationMs = Number(end - start) / 1_000_000;
      expect(durationMs).toBeLessThan(1);
    });

    it('should set request header in less than 1ms', () => {
      const mockResponse = {
        headers: {},
        setHeader: function (key: string, value: string) {
          this.headers[key] = value;
        },
      } as unknown as Response;

      const start = process.hrtime.bigint();
      setRequestIdHeader(mockResponse, generateRequestId());
      const end = process.hrtime.bigint();

      const durationMs = Number(end - start) / 1_000_000;
      expect(durationMs).toBeLessThan(1);
    });

    it('should store/retrieve context in less than 1ms', () => {
      const context = { requestId: generateRequestId() };

      const start = process.hrtime.bigint();
      const result = runWithRequestContext(context, () => {
        return getRequestContext();
      });
      const end = process.hrtime.bigint();

      const durationMs = Number(end - start) / 1_000_000;
      expect(result).toBeDefined();
      expect(durationMs).toBeLessThan(1);
    });

    it('request ID processing should have minimal impact on request latency', async () => {
      // Make multiple requests and verify they complete quickly
      const startTime = Date.now();

      for (let i = 0; i < 10; i++) {
        await request(app.getHttpServer())
          .get('/api/v1/health')
          .set('X-Request-Id', generateRequestId());
      }

      const duration = Date.now() - startTime;
      const avgDuration = duration / 10;

      // Average request should complete in less than 100ms
      expect(avgDuration).toBeLessThan(100);
    });
  });
});
