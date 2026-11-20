import { Controller, Get, INestApplication, UseGuards } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Keypair } from '@stellar/stellar-sdk';
import request from 'supertest';
import { AllExceptionsFilter } from '../../common/filters/all-exceptions.filter';
import { createValidationPipe } from '../../common/filters/validation';
import { REDIS_CLIENT, RedisService } from '../../redis/redis.service';
import { AuthModule } from '../auth.module';
import { loginMessage } from '../auth.service';
import { Role } from '../auth.types';
import { Roles } from '../decorators/roles.decorator';
import { JwtAuthGuard } from '../guards/jwt-auth.guard';
import { RolesGuard } from '../guards/roles.guard';
import { FakeRedisService } from './fake-redis';

@Controller('protected')
@UseGuards(JwtAuthGuard, RolesGuard)
class ProtectedController {
  @Get() any() { return { ok: true }; }
  @Get('admin') @Roles(Role.ADMIN) admin() { return { admin: true }; }
}

describe('Auth (e2e)', () => {
  let app: INestApplication;
  const keypair = Keypair.random();

  beforeAll(async () => {
    process.env.JWT_SECRET = 'e2e-secret-e2e-secret';
    const moduleRef = await Test.createTestingModule({
      imports: [AuthModule],
      controllers: [ProtectedController],
    })
      // Keep the real ioredis client from connecting during tests.
      .overrideProvider(REDIS_CLIENT)
      .useValue({})
      .overrideProvider(RedisService)
      .useValue(new FakeRedisService())
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(createValidationPipe());
    app.useGlobalFilters(new AllExceptionsFilter(true));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  async function login() {
    const address = keypair.publicKey();
    const nonce = await request(app.getHttpServer()).post('/auth/nonce').send({ address }).expect(200);
    const signature = keypair.sign(Buffer.from(nonce.body.message)).toString('base64');
    expect(nonce.body.message).toBe(loginMessage(address, nonce.body.nonce));
    return request(app.getHttpServer()).post('/auth/login').send({ address, signature });
  }

  it('rejects malformed addresses with field errors', async () => {
    const res = await request(app.getHttpServer()).post('/auth/nonce').send({ address: 'nope' }).expect(400);
    expect(res.body).toMatchObject({ code: 'VALIDATION_FAILED', errors: [{ field: 'address' }] });
  });

  it('runs the full wallet login, protected access, refresh and logout flow', async () => {
    const res = await login();
    expect(res.status).toBe(200);
    const { accessToken, refreshToken } = res.body;

    await request(app.getHttpServer()).get('/protected').expect(401);
    await request(app.getHttpServer()).get('/protected').set('Authorization', `Bearer ${accessToken}`).expect(200);
    await request(app.getHttpServer()).get('/protected/admin').set('Authorization', `Bearer ${accessToken}`).expect(403);
    await request(app.getHttpServer()).get('/protected').set('Authorization', `Bearer ${refreshToken}`).expect(401);

    const refreshed = await request(app.getHttpServer()).post('/auth/refresh').send({ refreshToken }).expect(200);
    await request(app.getHttpServer()).post('/auth/refresh').send({ refreshToken }).expect(401);

    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${refreshed.body.accessToken}`)
      .send({ refreshToken: refreshed.body.refreshToken })
      .expect(204);
    await request(app.getHttpServer()).get('/protected').set('Authorization', `Bearer ${refreshed.body.accessToken}`).expect(401);
  });

  it('rejects a bad signature with INVALID_CREDENTIALS', async () => {
    const address = keypair.publicKey();
    await request(app.getHttpServer()).post('/auth/nonce').send({ address }).expect(200);
    const bad = Buffer.alloc(64, 1).toString('base64');
    const res = await request(app.getHttpServer()).post('/auth/login').send({ address, signature: bad }).expect(401);
    expect(res.body.code).toBe('INVALID_CREDENTIALS');
  });
});
