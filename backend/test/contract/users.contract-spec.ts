import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createContractApp } from './support/contract-app';
import './support/openapi';

const LINK_ID = '44444444-4444-4444-8444-444444444444';

describe('Users contract', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createContractApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /users/me returns a spec-compliant user', async () => {
    const res = await request(app.getHttpServer()).get('/users/me');

    expect(res.status).toBe(200);
    expect(res).toSatisfyApiSpec();
  });

  it('PATCH /users/me returns a spec-compliant user', async () => {
    const res = await request(app.getHttpServer())
      .patch('/users/me')
      .send({ displayName: 'Alice the Developer', timezone: 'UTC' });

    expect(res.status).toBe(200);
    expect(res).toSatisfyApiSpec();
  });

  it('DELETE /users/me returns a spec-compliant 204 with no body', async () => {
    const res = await request(app.getHttpServer()).delete('/users/me');

    expect(res.status).toBe(204);
    expect(res).toSatisfyApiSpec();
  });

  it('GET /users returns a spec-compliant response', async () => {
    const res = await request(app.getHttpServer()).get('/users?page=1&limit=20');

    expect(res.status).toBe(200);
    expect(res).toSatisfyApiSpec();
  });

  it('GET /user/username/available returns a spec-compliant response', async () => {
    const res = await request(app.getHttpServer()).get('/user/username/available?username=alice_dev');

    expect(res.status).toBe(200);
    expect(res).toSatisfyApiSpec();
  });

  it('PATCH /user/username returns a spec-compliant user', async () => {
    const res = await request(app.getHttpServer()).patch('/user/username').send({ username: 'alice_dev' });

    expect(res.status).toBe(200);
    expect(res).toSatisfyApiSpec();
  });

  it('PATCH /user/display-name returns a spec-compliant user', async () => {
    const res = await request(app.getHttpServer())
      .patch('/user/display-name')
      .send({ displayName: 'Alice the Developer' });

    expect(res.status).toBe(200);
    expect(res).toSatisfyApiSpec();
  });

  it('GET /profiles/:identifier returns a spec-compliant public profile', async () => {
    const res = await request(app.getHttpServer()).get('/profiles/alice_dev');

    expect(res.status).toBe(200);
    expect(res).toSatisfyApiSpec();
  });

  it('POST /user/portfolio-links returns a spec-compliant created link', async () => {
    const res = await request(app.getHttpServer())
      .post('/user/portfolio-links')
      .send({ url: 'https://github.com/alice', platform: 'github', displayTitle: 'My GitHub' });

    expect(res.status).toBe(201);
    expect(res).toSatisfyApiSpec();
  });

  it('DELETE /user/portfolio-links/:id returns a spec-compliant 204', async () => {
    const res = await request(app.getHttpServer()).delete(`/user/portfolio-links/${LINK_ID}`);

    expect(res.status).toBe(204);
    expect(res).toSatisfyApiSpec();
  });

  it('DELETE /admin/portfolio-links/:id returns a spec-compliant 204', async () => {
    const res = await request(app.getHttpServer()).delete(`/admin/portfolio-links/${LINK_ID}`);

    expect(res.status).toBe(204);
    expect(res).toSatisfyApiSpec();
  });
});
