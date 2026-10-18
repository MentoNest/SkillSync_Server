import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('AppController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/ (GET) responds inside the standard success envelope', async () => {
    const res = await request(app.getHttpServer()).get('/').expect(200);

    expect(res.body).toMatchObject({
      success: true,
      statusCode: 200,
      message: 'OK',
      data: 'Hello World!',
      path: '/',
    });
    expect(typeof res.body.timestamp).toBe('string');
  });

  afterEach(async () => {
    await app.close();
  });
});
