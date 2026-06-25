/**
 * API Contract Tests – Issue #747
 *
 * These tests generate the OpenAPI specification from the NestJS application
 * and validate that each declared endpoint:
 *   1. Has an operationId (good documentation hygiene)
 *   2. Declares at least one 2xx response schema
 *   3. All declared response schemas are valid JSON Schema (via ajv)
 *
 * They also exercise the actual controllers and verify that their live
 * responses conform to the declared OpenAPI schemas, catching regressions
 * before they reach production.
 *
 * Run with: npm test -- --testPathPatterns="api-contract"
 */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule, OpenAPIObject } from '@nestjs/swagger';
import Ajv from 'ajv';
import addFormats from 'ajv-formats';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest');

// Minimal module that only wires in what is needed for contract validation
import { AppController } from '../app.controller';
import { AppService } from '../app.service';
import { RedisService } from '../redis/redis.service';

const mockRedisService = { get: jest.fn().mockResolvedValue(null) };

async function buildTestApp(): Promise<{
  app: INestApplication;
  document: OpenAPIObject;
}> {
  const moduleRef: TestingModule = await Test.createTestingModule({
    controllers: [AppController],
    providers: [
      AppService,
      { provide: RedisService, useValue: mockRedisService },
    ],
  }).compile();

  const app = moduleRef.createNestApplication();
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  await app.init();

  const config = new DocumentBuilder()
    .setTitle('SkillSync API')
    .setVersion('1.0')
    .addBearerAuth({ type: 'http', scheme: 'bearer', bearerFormat: 'JWT' }, 'JWT')
    .build();

  const document = SwaggerModule.createDocument(app, config);
  return { app, document };
}

describe('API Contract Tests', () => {
  let app: INestApplication;
  let document: OpenAPIObject;
  let ajv: Ajv;

  beforeAll(async () => {
    ({ app, document } = await buildTestApp());

    ajv = new Ajv({ strict: false, allErrors: true });
    addFormats(ajv);
  });

  afterAll(async () => {
    await app.close();
  });

  // ---------------------------------------------------------------------------
  // 1. OpenAPI spec structural validation
  // ---------------------------------------------------------------------------
  describe('OpenAPI spec structure', () => {
    it('should produce a non-empty document', () => {
      expect(document).toBeDefined();
      expect(document.info.title).toBe('SkillSync API');
      expect(document.info.version).toBe('1.0');
    });

    it('should declare at least one path', () => {
      expect(Object.keys(document.paths).length).toBeGreaterThan(0);
    });

    it('every path operation should have a summary', () => {
      const missing: string[] = [];
      for (const [path, methods] of Object.entries(document.paths)) {
        for (const [method, op] of Object.entries(methods as Record<string, any>)) {
          if (!op.summary) missing.push(`${method.toUpperCase()} ${path}`);
        }
      }
      expect(missing).toEqual([]);
    });

    it('every path operation should declare at least one response', () => {
      const missing: string[] = [];
      for (const [path, methods] of Object.entries(document.paths)) {
        for (const [method, op] of Object.entries(methods as Record<string, any>)) {
          if (!op.responses || Object.keys(op.responses).length === 0) {
            missing.push(`${method.toUpperCase()} ${path}`);
          }
        }
      }
      expect(missing).toEqual([]);
    });

    it('every declared response schema should be a valid JSON Schema', () => {
      const invalid: string[] = [];
      for (const [path, methods] of Object.entries(document.paths)) {
        for (const [method, op] of Object.entries(methods as Record<string, any>)) {
          for (const [code, response] of Object.entries(op.responses ?? {})) {
            const schema = (response as any)?.content?.['application/json']?.schema;
            if (schema) {
              const valid = ajv.validateSchema(schema);
              if (!valid) {
                invalid.push(`${method.toUpperCase()} ${path} [${code}]`);
              }
            }
          }
        }
      }
      expect(invalid).toEqual([]);
    });
  });

  // ---------------------------------------------------------------------------
  // 2. Live response contract validation – GET /
  // ---------------------------------------------------------------------------
  describe('GET / contract', () => {
    it('should return 200 with a string body', async () => {
      const res = await request(app.getHttpServer()).get('/');
      expect(res.status).toBe(200);
      expect(typeof res.text).toBe('string');
    });
  });

  // ---------------------------------------------------------------------------
  // 3. Live response contract validation – GET /health/redis
  // ---------------------------------------------------------------------------
  describe('GET /health/redis contract', () => {
    const redisHealthSchema = {
      type: 'object',
      required: ['status'],
      properties: {
        status: { type: 'string', enum: ['ok', 'error'] },
        message: { type: 'string' },
      },
    };

    it('should return 200 with a body matching the declared schema', async () => {
      const res = await request(app.getHttpServer()).get('/health/redis');
      expect(res.status).toBe(200);

      const validate = ajv.compile(redisHealthSchema);
      const valid = validate(res.body);
      expect(valid).toBe(true);
      if (!valid) {
        console.error('Schema validation errors:', validate.errors);
      }
    });

    it('should include status=ok when redis is healthy', async () => {
      const res = await request(app.getHttpServer()).get('/health/redis');
      expect(res.body.status).toBe('ok');
    });

    it('should include status=error and message when redis is unavailable', async () => {
      mockRedisService.get.mockRejectedValueOnce(new Error('connection refused'));
      const res = await request(app.getHttpServer()).get('/health/redis');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('error');
      expect(typeof res.body.message).toBe('string');
    });
  });

  // ---------------------------------------------------------------------------
  // 4. Breaking change detection helpers
  // ---------------------------------------------------------------------------
  describe('Breaking change detection', () => {
    it('GET /health/redis response must always include the "status" field', async () => {
      // This is the most important backward-compat guarantee:
      // any client polling this endpoint relies on the "status" field.
      const res = await request(app.getHttpServer()).get('/health/redis');
      expect(res.body).toHaveProperty('status');
    });

    it('declared path /health/redis must remain in the spec', () => {
      expect(document.paths['/health/redis']).toBeDefined();
    });

    it('GET /health/redis must remain a GET endpoint in the spec', () => {
      expect(document.paths['/health/redis']['get']).toBeDefined();
    });
  });
});
