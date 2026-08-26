import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from './../src/app.module';

describe('AuthController (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    await app.init();
  });

  it('/auth/nonce/:wallet (GET) should issue nonce challenge', () => {
    const validWallet = '0x71C841832047387195060979DC80EbbE62DCE35B';
    return request(app.getHttpServer())
      .get(`/auth/nonce/${validWallet}`)
      .expect(200);
  });

  afterAll(async () => {
    if (app) {
      await app.close();
    }
  });
});
