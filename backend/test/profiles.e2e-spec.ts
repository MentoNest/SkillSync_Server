import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('ProfilesController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  it('/profiles/:userId (GET) returns 404 for an unknown user without requiring auth', () => {
    return request(app.getHttpServer())
      .get('/profiles/00000000-0000-0000-0000-000000000000')
      .expect(404);
  });
});
