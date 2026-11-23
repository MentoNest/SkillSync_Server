import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createContractApp } from './support/contract-app';
import './support/openapi';

const USER_ADDRESS = 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37';

describe('Admin contract', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createContractApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /admin/users/:userId/profile-history returns a spec-compliant page', async () => {
    const res = await request(app.getHttpServer()).get(`/admin/users/${USER_ADDRESS}/profile-history?limit=50&offset=0`);

    expect(res.status).toBe(200);
    expect(res).toSatisfyApiSpec();
  });
});
