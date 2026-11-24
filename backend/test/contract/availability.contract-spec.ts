import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { createContractApp } from './support/contract-app';
import './support/openapi';

const MENTOR_ADDRESS = 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37';
const SLOT_ID = '22222222-2222-4222-8222-222222222222';
const EXCEPTION_ID = '33333333-3333-4333-8333-333333333333';

describe('Availability contract', () => {
  let app: INestApplication;

  beforeAll(async () => {
    app = await createContractApp();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /mentors/me/availability/slots returns spec-compliant slots', async () => {
    const res = await request(app.getHttpServer()).get('/mentors/me/availability/slots');

    expect(res.status).toBe(200);
    expect(res).toSatisfyApiSpec();
  });

  it('POST /mentors/me/availability/slots returns a spec-compliant slot', async () => {
    const res = await request(app.getHttpServer())
      .post('/mentors/me/availability/slots')
      .send({ dayOfWeek: 1, startTimeUtc: '10:00', endTimeUtc: '12:00', timezone: 'UTC' });

    expect(res.status).toBe(201);
    expect(res).toSatisfyApiSpec();
  });

  it('PUT /mentors/me/availability/slots/:id returns a spec-compliant slot', async () => {
    const res = await request(app.getHttpServer())
      .put(`/mentors/me/availability/slots/${SLOT_ID}`)
      .send({ startTimeUtc: '09:00', endTimeUtc: '11:00' });

    expect(res.status).toBe(200);
    expect(res).toSatisfyApiSpec();
  });

  it('DELETE /mentors/me/availability/slots/:id returns a spec-compliant 204', async () => {
    const res = await request(app.getHttpServer()).delete(`/mentors/me/availability/slots/${SLOT_ID}`);

    expect(res.status).toBe(204);
    expect(res).toSatisfyApiSpec();
  });

  it('GET /mentors/me/availability/exceptions returns spec-compliant exceptions', async () => {
    const res = await request(app.getHttpServer()).get('/mentors/me/availability/exceptions');

    expect(res.status).toBe(200);
    expect(res).toSatisfyApiSpec();
  });

  it('POST /mentors/me/availability/exceptions returns a spec-compliant exception', async () => {
    const res = await request(app.getHttpServer())
      .post('/mentors/me/availability/exceptions')
      .send({ date: '2026-12-25', startTimeUtc: '00:00', endTimeUtc: '23:59', reason: 'Holiday', isUnavailable: true });

    expect(res.status).toBe(201);
    expect(res).toSatisfyApiSpec();
  });

  it('PUT /mentors/me/availability/exceptions/:id returns a spec-compliant exception', async () => {
    const res = await request(app.getHttpServer())
      .put(`/mentors/me/availability/exceptions/${EXCEPTION_ID}`)
      .send({ reason: 'Vacation' });

    expect(res.status).toBe(200);
    expect(res).toSatisfyApiSpec();
  });

  it('DELETE /mentors/me/availability/exceptions/:id returns a spec-compliant 204', async () => {
    const res = await request(app.getHttpServer()).delete(`/mentors/me/availability/exceptions/${EXCEPTION_ID}`);

    expect(res.status).toBe(204);
    expect(res).toSatisfyApiSpec();
  });

  it('GET /mentors/:mentorId/availability/slots returns spec-compliant slots', async () => {
    const res = await request(app.getHttpServer()).get(`/mentors/${MENTOR_ADDRESS}/availability/slots`);

    expect(res.status).toBe(200);
    expect(res).toSatisfyApiSpec();
  });

  it('GET /mentors/:mentorId/availability/exceptions returns spec-compliant exceptions', async () => {
    const res = await request(app.getHttpServer()).get(`/mentors/${MENTOR_ADDRESS}/availability/exceptions`);

    expect(res.status).toBe(200);
    expect(res).toSatisfyApiSpec();
  });

  it('GET /mentors/:mentorId/availability/check returns a spec-compliant availability result', async () => {
    const res = await request(app.getHttpServer()).get(
      `/mentors/${MENTOR_ADDRESS}/availability/check?dateTime=2026-11-23T10:30:00.000Z`,
    );

    expect(res.status).toBe(200);
    expect(res).toSatisfyApiSpec();
  });

  it('GET /mentors/:mentorId/availability/next-30-days returns spec-compliant windows', async () => {
    const res = await request(app.getHttpServer()).get(`/mentors/${MENTOR_ADDRESS}/availability/next-30-days`);

    expect(res.status).toBe(200);
    expect(res).toSatisfyApiSpec();
  });
});
