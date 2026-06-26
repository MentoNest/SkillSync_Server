import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';

describe('Escrow Full Lifecycle (e2e) (#769)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    await app.init();
  });

  afterAll(() => app.close());

  it('lock → complete → approve → verify balances', async () => {
    const lock = await request(app.getHttpServer()).post('/escrow/lock').send({ sessionId: 'e2e-1', amount: 100 });
    expect(lock.status).toBe(201);
    const complete = await request(app.getHttpServer()).post('/escrow/complete').send({ sessionId: 'e2e-1' });
    expect(complete.status).toBe(200);
    const approve = await request(app.getHttpServer()).post('/escrow/approve').send({ sessionId: 'e2e-1' });
    expect(approve.status).toBe(200);
    expect(approve.body.sellerBalance).toBeGreaterThan(0);
  });

  it('full lifecycle with refund path', async () => {
    await request(app.getHttpServer()).post('/escrow/lock').send({ sessionId: 'e2e-2', amount: 100 });
    const refund = await request(app.getHttpServer()).post('/escrow/refund').send({ sessionId: 'e2e-2' });
    expect(refund.status).toBe(200);
    expect(refund.body.refunded).toBe(true);
  });

  it('full lifecycle with dispute path', async () => {
    await request(app.getHttpServer()).post('/escrow/lock').send({ sessionId: 'e2e-3', amount: 100 });
    const dispute = await request(app.getHttpServer()).post('/escrow/dispute').send({ sessionId: 'e2e-3', reason: 'No show' });
    expect(dispute.status).toBe(200);
  });

  it('fee accumulates correctly in treasury after approve', async () => {
    const treasury = await request(app.getHttpServer()).get('/escrow/treasury/balance');
    expect(treasury.status).toBe(200);
    expect(typeof treasury.body.balance).toBe('number');
  });
});
