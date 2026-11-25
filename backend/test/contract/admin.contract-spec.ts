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
    const res = await request(app.getHttpServer()).get(
      `/admin/users/${USER_ADDRESS}/profile-history?limit=50&offset=0`,
    );

    expect(res.status).toBe(200);
    expect(res).toSatisfyApiSpec();
  });

  it('POST /admin/users/:userId/suspend and unsuspend satisfy the API spec', async () => {
    const suspendRes = await request(app.getHttpServer())
      .post(`/admin/users/${USER_ADDRESS}/suspend`)
      .send({ reason: 'Violation of terms', duration: 7 });
    expect(suspendRes.status).toBe(200);
    expect(suspendRes).toSatisfyApiSpec();

    const unsuspendRes = await request(app.getHttpServer())
      .post(`/admin/users/${USER_ADDRESS}/unsuspend`)
      .send({ reason: 'Resolved' });
    expect(unsuspendRes.status).toBe(200);
    expect(unsuspendRes).toSatisfyApiSpec();

    const listRes = await request(app.getHttpServer()).get(
      '/admin/users/suspended?page=1&limit=20',
    );
    expect(listRes.status).toBe(200);
    expect(listRes).toSatisfyApiSpec();
  });
});
