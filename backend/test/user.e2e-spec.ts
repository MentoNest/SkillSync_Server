import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { UserController } from '../src/user/user.controller';
import { UserService } from '../src/user/user.service';

describe('User module (e2e scaffold)', () => {
  let app: INestApplication;
  const service = {
    findMe: jest
      .fn()
      .mockResolvedValue({ walletAddress: 'GADDR', displayName: 'Alice' }),
    updateMe: jest
      .fn()
      .mockResolvedValue({ walletAddress: 'GADDR', displayName: 'Bob' }),
    removeMe: jest.fn().mockResolvedValue(undefined),
    findAll: jest
      .fn()
      .mockResolvedValue({ data: [], total: 0, page: 1, limit: 20 }),
    checkAvailability: jest.fn(),
    setUsername: jest.fn(),
    setDisplayName: jest.fn(),
    getPublicProfile: jest.fn(),
  };

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [UserController],
      providers: [{ provide: UserService, useValue: service }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: any) => {
          ctx.switchToHttp().getRequest().user = { address: 'GADDR' };
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();
  });

  afterAll(async () => app.close());

  it('GET /users/me', () =>
    request(app.getHttpServer())
      .get('/users/me')
      .expect(200)
      .expect(({ body }) => {
        expect(body.walletAddress).toBe('GADDR');
      }));

  it('PATCH /users/me', () =>
    request(app.getHttpServer())
      .patch('/users/me')
      .send({ displayName: 'Bob' })
      .expect(200));

  it('DELETE /users/me', () =>
    request(app.getHttpServer()).delete('/users/me').expect(204));
});
