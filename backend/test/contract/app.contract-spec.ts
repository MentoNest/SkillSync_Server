import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createContractApp } from './support/contract-app';
import './support/openapi';

/**
 * Validates the real HTTP responses of the always-on endpoints against
 * `openapi/openapi.json`. If a controller's response ever stops matching the published
 * contract, these tests fail.
 */
describe('App + health contract', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createContractApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET / returns a spec-compliant response', async () => {
    const res = await request(app.getHttpServer()).get('/');

    expect(res.status).toBe(200);
    expect(res).toSatisfyApiSpec();
  });

  it('GET /health/redis returns a spec-compliant response', async () => {
    const res = await request(app.getHttpServer()).get('/health/redis');

    expect(res.status).toBe(200);
    expect(res).toSatisfyApiSpec();
  });
});
