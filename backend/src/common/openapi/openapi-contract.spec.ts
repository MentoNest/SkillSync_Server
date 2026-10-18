import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { findBreakingChanges } from './openapi-diff';
import { responseSchemaFor, validateAgainstSchema } from './openapi-validator';

const baseDoc = {
  openapi: '3.0.0',
  paths: {
    '/users/{id}': {
      get: {
        parameters: [{ name: 'id', in: 'path', required: true, schema: { type: 'string' } }],
        responses: {
          '200': {
            content: {
              'application/json': { schema: { $ref: '#/components/schemas/User' } },
            },
          },
        },
      },
    },
    '/health': { get: { responses: { '200': {} } } },
  },
  components: {
    schemas: {
      User: {
        type: 'object',
        required: ['id', 'walletAddress'],
        properties: {
          id: { type: 'string' },
          walletAddress: { type: 'string' },
          status: { type: 'string', enum: ['active', 'suspended'] },
          displayName: { type: 'string', nullable: true },
        },
      },
    },
  },
};

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

describe('OpenAPI breaking-change detection', () => {
  it('reports nothing for an identical document', () => {
    expect(findBreakingChanges(baseDoc, clone(baseDoc))).toEqual([]);
  });

  it('allows additive changes', () => {
    const head: any = clone(baseDoc);
    head.paths['/sessions'] = { get: { responses: { '200': {} } } };
    head.components.schemas.User.properties.bio = { type: 'string' };
    head.paths['/users/{id}'].get.parameters.push({
      name: 'expand',
      in: 'query',
      required: false,
      schema: { type: 'string' },
    });
    expect(findBreakingChanges(baseDoc, head)).toEqual([]);
  });

  it('flags removed endpoints and methods', () => {
    const head: any = clone(baseDoc);
    delete head.paths['/health'];
    expect(findBreakingChanges(baseDoc, head)).toContain('GET /health: endpoint was removed');
  });

  it('flags new required parameters', () => {
    const head: any = clone(baseDoc);
    head.paths['/users/{id}'].get.parameters.push({
      name: 'tenant',
      in: 'query',
      required: true,
      schema: { type: 'string' },
    });
    expect(findBreakingChanges(baseDoc, head)).toEqual([
      'GET /users/{id}: new required query parameter "tenant"',
    ]);
  });

  it('flags removed response properties', () => {
    const head: any = clone(baseDoc);
    delete head.components.schemas.User.properties.walletAddress;
    expect(findBreakingChanges(baseDoc, head)).toEqual([
      'GET /users/{id} 200: response property "walletAddress" was removed',
    ]);
  });

  it('flags newly required request properties', () => {
    const base: any = clone(baseDoc);
    base.paths['/users'] = {
      post: {
        requestBody: {
          content: { 'application/json': { schema: { type: 'object', required: ['a'] } } },
        },
        responses: { '201': {} },
      },
    };
    const head: any = clone(base);
    head.paths['/users'].post.requestBody.content['application/json'].schema.required = ['a', 'b'];
    expect(findBreakingChanges(base, head)).toEqual([
      'POST /users: request property "b" is now required',
    ]);
  });
});

describe('response contract validation', () => {
  const schema = responseSchemaFor(baseDoc, '/users/{id}', 'get', 200)!;

  it('accepts a conforming response', () => {
    const body = { id: 'u1', walletAddress: 'G...', status: 'active', displayName: null };
    expect(validateAgainstSchema(baseDoc, schema, body)).toEqual([]);
  });

  it('reports missing required properties and wrong types', () => {
    const errors = validateAgainstSchema(baseDoc, schema, { id: 5, status: 'banned' });
    expect(errors).toEqual(
      expect.arrayContaining([
        '$.walletAddress: required property is missing',
        '$.id: expected string',
        expect.stringContaining('$.status'),
      ]),
    );
  });
});

describe('committed OpenAPI document', () => {
  const file = join(__dirname, '..', '..', '..', 'docs', 'openapi.json');

  (existsSync(file) ? it : it.skip)('is a valid OpenAPI 3 document', () => {
    const doc = JSON.parse(readFileSync(file, 'utf8'));
    expect(String(doc.openapi)).toMatch(/^3\./);
    expect(Object.keys(doc.paths ?? {}).length).toBeGreaterThan(0);
  });
});
