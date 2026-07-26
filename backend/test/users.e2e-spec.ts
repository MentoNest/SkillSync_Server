import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';

describe('UsersController (e2e)', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );
    await app.init();
  });

  it('/user (GET) rejects requests without a token', () => {
    return request(app.getHttpServer()).get('/user').expect(401);
  });

  it('/user (PATCH) rejects requests without a token', () => {
    return request(app.getHttpServer())
      .patch('/user')
      .send({ displayName: 'New Name' })
      .expect(401);
  });

  it('/user (DELETE) rejects requests without a token', () => {
    return request(app.getHttpServer()).delete('/user').expect(401);
  });

  it('/user/admin (GET) rejects requests without a token', () => {
    return request(app.getHttpServer()).get('/user/admin').expect(401);
  });
});
