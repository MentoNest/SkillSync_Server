import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createContractApp } from './support/contract-app';
import './support/openapi';

describe('Profiles contract', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createContractApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('POST /user/profile returns a spec-compliant created profile', async () => {
    const res = await request(app.getHttpServer())
      .post('/user/profile')
      .send({
        profileType: 'mentor',
        bio: 'Senior engineer with 10 years in distributed systems.',
        skills: ['TypeScript', 'NestJS'],
        hourlyRateUsdCents: 5000,
        maxMentees: 3,
        languages: ['English'],
      });

    expect(res.status).toBe(201);
    expect(res).toSatisfyApiSpec();
  });

  it('POST /user/profile rejects an invalid body with the documented error envelope', async () => {
    const res = await request(app.getHttpServer()).post('/user/profile').send({ profileType: 'invalid' });

    expect(res.status).toBe(400);
    expect(res).toSatisfyApiSpec();
  });
});
