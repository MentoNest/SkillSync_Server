import { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_PIPE } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { randomUUID } from 'crypto';
import request from 'supertest';
import { App } from 'supertest/types';
import { FindOperator } from 'typeorm';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { createAppValidationPipe } from '../src/common/pipes/app-validation.pipe';
import { MentorProfile } from '../src/users/entities/mentor-profile.entity';
import { User } from '../src/users/entities/user.entity';
import { UsersModule } from '../src/users/users.module';
import { UsersService } from '../src/users/users.service';

process.env.JWT_SECRET = process.env.JWT_SECRET || 'skillsync-e2e-secret';

function matchesWhere(row: User, where: Record<string, unknown>): boolean {
  for (const [key, cond] of Object.entries(where)) {
    if (cond === undefined) continue;
    if (key === 'roles') {
      const roleCond = cond as { name?: string };
      if (!(row.roles ?? []).some((role) => role.name === roleCond.name)) return false;
      continue;
    }
    const rowVal = (row as unknown as Record<string, unknown>)[key];
    if (cond instanceof FindOperator) {
      const op = cond.type as string;
      if (op === 'like' || op === 'ilike') {
        const needle = String(cond.value ?? '').replace(/%/g, '').toLowerCase();
        if (!String(rowVal ?? '').toLowerCase().includes(needle)) return false;
      } else if (rowVal !== cond.value) {
        return false;
      }
      continue;
    }
    if (rowVal !== cond) return false;
  }
  return true;
}

class InMemoryUserRepo {
  private rows: User[] = [];

  async findOne(options: { where?: unknown; withDeleted?: boolean } = {}): Promise<User | null> {
    const where = (options.where ?? {}) as Record<string, unknown>;
    const row = this.rows.find((candidate) => {
      if (!options.withDeleted && candidate.deletedAt) return false;
      return matchesWhere(candidate, where);
    });
    return row ? { ...row, roles: [...(row.roles ?? [])] } : null;
  }

  async findAndCount(
    options: { where?: unknown; skip?: number; take?: number } = {},
  ): Promise<[User[], number]> {
    const where = options.where;
    let matched = this.rows.filter((candidate) => {
      if (candidate.deletedAt) return false;
      if (!where) return true;
      if (Array.isArray(where)) {
        return where.some((clause) => matchesWhere(candidate, clause as Record<string, unknown>));
      }
      const clause = where as Record<string, unknown>;
      if (Object.keys(clause).length === 0) return true;
      return matchesWhere(candidate, clause);
    });
    matched = [...matched].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    const total = matched.length;
    const skip = options.skip ?? 0;
    const take = options.take ?? total;
    const page = matched.slice(skip, skip + take);
    return [page.map((row) => ({ ...row, roles: [...(row.roles ?? [])] })), total];
  }

  create(input: Partial<User>): User {
    return {
      roles: [],
      status: 'active',
      tokenVersion: 0,
      email: null,
      displayName: null,
      avatarUrl: null,
      timezone: null,
      locale: null,
      lastLoginAt: null,
      deletedAt: null,
      ...input,
    } as unknown as User;
  }

  async save(entity: User): Promise<User> {
    const now = new Date();
    if (!entity.id) {
      entity.id = randomUUID();
      entity.createdAt = now;
    }
    entity.updatedAt = now;
    const index = this.rows.findIndex((row) => row.id === entity.id);
    if (index >= 0) {
      this.rows[index] = entity;
    } else {
      this.rows.push(entity);
    }
    return entity;
  }
}

describe('Users API (e2e)', () => {
  let app: INestApplication<App>;
  let repo: InMemoryUserRepo;
  let jwtService: JwtService;
  let usersService: UsersService;

  const walletAlice = 'G' + 'B'.repeat(55);
  const walletBob = 'G' + 'C'.repeat(55);
  const walletDeleted = 'G' + 'D'.repeat(55);

  const signFor = (userId: string): string =>
    jwtService.sign(
      {
        sub: userId,
        wallet: walletAlice,
        roles: [],
        permissions: [],
        ver: 0,
        jti: randomUUID(),
      },
      { issuer: 'skillsync', audience: 'skillsync-api', expiresIn: 900 },
    );

  beforeAll(async () => {
    repo = new InMemoryUserRepo();
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), UsersModule],
      providers: [
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
        { provide: APP_PIPE, useValue: createAppValidationPipe() },
      ],
    })
      .overrideProvider(getRepositoryToken(User))
      .useValue(repo)
      .overrideProvider(getRepositoryToken(MentorProfile))
      .useValue({})
      .compile();

    app = moduleFixture.createNestApplication();
    await app.init();
    jwtService = app.get(JwtService, { strict: false });
    usersService = app.get(UsersService, { strict: false });
  });

  afterAll(async () => {
    await app.close();
  });

  it('rejects unauthenticated access to /users/me', async () => {
    const res = await request(app.getHttpServer()).get('/users/me').expect(401);
    expect(res.body.statusCode).toBe(401);
    expect(res.body.requestId).toEqual(expect.any(String));
    expect(res.body.timestamp).toEqual(expect.any(String));
  });

  it('returns the own profile for a valid token', async () => {
    const user = await usersService.findOrCreateByWallet({ walletAddress: walletAlice });
    const res = await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${signFor(user.id)}`)
      .expect(200);
    expect(res.body.id).toBe(user.id);
    expect(res.body.walletAddress).toBe(walletAlice);
    expect(res.body.email).toBeNull();
    expect(res.body.status).toBe('active');
    expect(Array.isArray(res.body.roles)).toBe(true);
  });

  it('validates the update payload', async () => {
    const user = await usersService.findOrCreateByWallet({ walletAddress: walletAlice });
    const res = await request(app.getHttpServer())
      .patch('/users/me')
      .set('Authorization', `Bearer ${signFor(user.id)}`)
      .send({ email: 'not-an-email' })
      .expect(400);
    expect(res.body.code).toBe('E_VALIDATION_ERROR');
    expect(res.body.details).toEqual([expect.objectContaining({ field: 'email' })]);
  });

  it('updates the own profile', async () => {
    const user = await usersService.findOrCreateByWallet({ walletAddress: walletAlice });
    const res = await request(app.getHttpServer())
      .patch('/users/me')
      .set('Authorization', `Bearer ${signFor(user.id)}`)
      .send({ displayName: 'Alice Onchain', timezone: 'UTC', locale: 'en' })
      .expect(200);
    expect(res.body.displayName).toBe('Alice Onchain');
    expect(res.body.timezone).toBe('UTC');
    expect(res.body.locale).toBe('en');
  });

  it('searches users with query parameters', async () => {
    const alice = await usersService.findOrCreateByWallet({ walletAddress: walletAlice });
    const bob = await usersService.findOrCreateByWallet({ walletAddress: walletBob });
    await usersService.updateOwnProfile(bob.id, { displayName: 'Bob Builder' });

    const res = await request(app.getHttpServer())
      .get('/users?q=builder&page=1&limit=5')
      .set('Authorization', `Bearer ${signFor(alice.id)}`)
      .expect(200);
    expect(res.body.total).toBe(1);
    expect(res.body.page).toBe(1);
    expect(res.body.limit).toBe(5);
    expect(res.body.items).toHaveLength(1);
    expect(res.body.items[0].walletAddress).toBe(walletBob);

    const all = await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${signFor(alice.id)}`)
      .expect(200);
    expect(all.body.total).toBeGreaterThanOrEqual(2);
    expect(Array.isArray(all.body.items)).toBe(true);
  });

  it('soft-deletes the own profile', async () => {
    const user = await usersService.findOrCreateByWallet({ walletAddress: walletDeleted });
    const token = signFor(user.id);
    const res = await request(app.getHttpServer())
      .delete('/users/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(res.body).toEqual({ success: true, id: user.id });

    const gone = await request(app.getHttpServer())
      .get('/users/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(404);
    expect(gone.body.code).toBe('E_RESOURCE_NOT_FOUND');
  });
});
