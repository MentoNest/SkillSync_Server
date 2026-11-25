import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createContractApp, FAKE_JWT } from './support/contract-app';
import './support/openapi';

const ADDRESS = 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37';
const SIGNATURE = 'c2lnbmF0dXJl'; // valid base64 (<= 128 chars)

describe('Auth contract', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createContractApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /auth/nonce returns a spec-compliant nonce response', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/nonce')
      .send({ address: ADDRESS });

    expect(res.status).toBe(200);
    expect(res).toSatisfyApiSpec();
  });

  it('POST /auth/nonce rejects an invalid address with the documented error envelope', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/nonce')
      .send({ address: 'not-a-key' });

    expect(res.status).toBe(400);
    expect(res).toSatisfyApiSpec();
  });

  it('POST /auth/login returns a spec-compliant token pair', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ address: ADDRESS, signature: SIGNATURE });

    expect(res.status).toBe(200);
    expect(res).toSatisfyApiSpec();
  });

  it('POST /auth/refresh returns a spec-compliant token pair', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/refresh')
      .send({ refreshToken: FAKE_JWT });

    expect(res.status).toBe(200);
    expect(res).toSatisfyApiSpec();
  });

  it('POST /auth/logout returns a spec-compliant 204 with no body', async () => {
    const res = await request(app.getHttpServer())
      .post('/auth/logout')
      .send({});

    expect(res.status).toBe(204);
    expect(res).toSatisfyApiSpec();
  });
});
