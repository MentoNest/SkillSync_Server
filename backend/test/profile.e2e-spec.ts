import {
  CanActivate,
  ExecutionContext,
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import request from 'supertest';
import { App } from 'supertest/types';
import { IS_PUBLIC_KEY } from '../src/auth/guards/jwt-auth.guard';
import { AuditService } from '../src/audit/audit.service';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { createAppValidationPipe } from '../src/common/pipes/app-validation.pipe';
import { RbacService } from '../src/rbac/rbac.service';
import { RolesGuard } from '../src/rbac/roles.guard';
import { REDIS } from '../src/redis/redis.module';
import { AvatarController } from '../src/users/avatar/avatar.controller';
import { AvatarService } from '../src/users/avatar/avatar.service';
import { AdminUserAccountController } from '../src/users/user-account/admin-user-account.controller';
import { UserAccountController } from '../src/users/user-account/user-account.controller';
import { UserAccountService } from '../src/users/user-account/user-account.service';
import { MenteeProfile } from '../src/users/entities/mentee-profile.entity';
import { MentorProfile } from '../src/users/entities/mentor-profile.entity';
import { User } from '../src/users/entities/user.entity';
import { ProfileController } from '../src/users/profile/profile.controller';
import { PublicProfileController } from '../src/users/profile/public-profile.controller';
import { ProfileType } from '../src/users/profile/dto/profile.dto';
import { ProfileService } from '../src/users/profile/profile.service';
import { UserSearchController } from '../src/users/user-search/user-search.controller';
import { UserSearchService } from '../src/users/user-search/user-search.service';

interface TestUser {
  sub: string;
  roles?: string[];
}

/** Stands in for `JwtAuthGuard`; see `auth-flows.e2e-spec.ts` for the rationale. */
class TestUserGuard implements CanActivate {
  canActivate(ctx: ExecutionContext): boolean {
    if (Reflect.getMetadata(IS_PUBLIC_KEY, ctx.getHandler())) return true;

    const req = ctx.switchToHttp().getRequest();
    const raw: string | undefined = req.headers['x-user'];
    if (!raw) throw new UnauthorizedException('Missing bearer token');

    req.user = JSON.parse(raw) as TestUser;
    return true;
  }
}

/** In-memory Redis covering the public-profile cache reads and invalidations. */
class FakeRedis {
  private readonly store = new Map<string, string>();

  reset(): void {
    this.store.clear();
  }

  async get(key: string): Promise<string | null> {
    return this.store.get(key) ?? null;
  }

  async set(key: string, value: string): Promise<'OK'> {
    this.store.set(key, value);
    return 'OK';
  }

  async del(key: string): Promise<number> {
    return this.store.delete(key) ? 1 : 0;
  }

  has(key: string): boolean {
    return this.store.has(key);
  }
}

/** One-pixel PNG, used as the "mock file" for avatar upload tests. */
const TINY_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64',
);

describe('Profile flows (e2e)', () => {
  let app: INestApplication<App>;
  let redis: FakeRedis;

  let users: Record<string, jest.Mock>;
  let mentorProfiles: Record<string, jest.Mock>;
  let menteeProfiles: Record<string, jest.Mock>;
  let audit: { record: jest.Mock };
  let rbac: { assignRole: jest.Mock };
  let avatar: { uploadAvatar: jest.Mock };
  let search: { search: jest.Mock };
  let account: Record<string, jest.Mock>;

  const mentorUser = '3f1b1c7e-0b1a-4d3e-9f2a-1b2c3d4e5f60';
  const menteeUser = '9a22b3c4-1d2e-4f50-8a61-2b3c4d5e6f70';
  const unknownUser = '00000000-0000-4000-8000-000000000000';

  const asMentor: TestUser = { sub: mentorUser, roles: ['mentor'] };
  const asMentee: TestUser = { sub: menteeUser, roles: ['mentee'] };
  const asAdmin: TestUser = { sub: 'admin-1', roles: ['admin'] };
  const asUser = (user: TestUser) => JSON.stringify(user);

  const mentorBody = {
    bio: 'Senior backend engineer, ten years on payments.',
    skills: ['typescript', 'postgresql'],
    hourlyRate: 90,
    expertiseAreas: ['fintech'],
    yearsOfExperience: 10,
  };

  const menteeBody = {
    learningGoals: ['Get better at testing'],
    areasOfInterest: ['backend'],
    skillLevel: 'beginner',
  };

  beforeEach(async () => {
    redis = new FakeRedis();

    const mentorRow = {
      id: 'mp-1',
      userId: mentorUser,
      bio: mentorBody.bio,
      skills: mentorBody.skills,
      expertiseAreas: mentorBody.expertiseAreas,
      hourlyRate: mentorBody.hourlyRate,
      yearsOfExperience: mentorBody.yearsOfExperience,
      averageRating: 4.8,
      reviewCount: 12,
      totalMentoringHours: 40,
      isVerified: true,
      profileVersion: 1,
      createdAt: new Date('2026-01-01'),
      updatedAt: new Date('2026-01-01'),
    };

    users = {
      findOne: jest.fn(async ({ where }: { where: { id?: string } }) => {
        if (where.id === mentorUser) {
          return { id: mentorUser, displayName: 'Ada', avatarUrl: null, createdAt: new Date('2026-01-01') };
        }
        if (where.id === menteeUser) {
          return { id: menteeUser, displayName: 'Ben', avatarUrl: null, createdAt: new Date('2026-02-01') };
        }
        return null;
      }),
      save: jest.fn(async (u: unknown) => u),
    };

    mentorProfiles = {
      findOne: jest.fn(async ({ where }: { where: { userId: string } }) =>
        where.userId === mentorUser ? mentorRow : null,
      ),
      create: jest.fn((v: unknown) => v),
      save: jest.fn(async (p: Partial<MentorProfile>) => ({ ...mentorRow, ...p })),
    };

    menteeProfiles = {
      findOne: jest.fn().mockResolvedValue(null),
      create: jest.fn((v: unknown) => v),
      save: jest.fn(async (p: unknown) => p),
    };

    audit = { record: jest.fn().mockResolvedValue(undefined) };
    rbac = { assignRole: jest.fn().mockResolvedValue(undefined) };

    avatar = {
      uploadAvatar: jest.fn().mockResolvedValue({
        avatarUrl: 'https://cdn.test/full.png',
        avatarThumbnailUrl: 'https://cdn.test/thumb.png',
        avatarSmallUrl: 'https://cdn.test/small.png',
        avatarMediumUrl: 'https://cdn.test/medium.png',
      }),
    };

    search = {
      search: jest.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, totalPages: 0 }),
    };

    account = {
      softDelete: jest.fn().mockResolvedValue({ id: menteeUser, status: 'deleted' }),
      restore: jest.fn().mockResolvedValue({ id: menteeUser, status: 'active' }),
      listDeleted: jest.fn().mockResolvedValue([]),
      purge: jest.fn().mockResolvedValue({ purged: true }),
    };

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true })],
      controllers: [
        ProfileController,
        PublicProfileController,
        UserSearchController,
        UserAccountController,
        AdminUserAccountController,
        AvatarController,
      ],
      providers: [
        ProfileService,
        { provide: getRepositoryToken(User), useValue: users },
        { provide: getRepositoryToken(MentorProfile), useValue: mentorProfiles },
        { provide: getRepositoryToken(MenteeProfile), useValue: menteeProfiles },
        { provide: AuditService, useValue: audit },
        { provide: RbacService, useValue: rbac },
        { provide: REDIS, useValue: redis },
        { provide: AvatarService, useValue: avatar },
        { provide: UserSearchService, useValue: search },
        { provide: UserAccountService, useValue: account },
        RolesGuard,
        { provide: APP_GUARD, useClass: TestUserGuard },
        { provide: APP_FILTER, useClass: AllExceptionsFilter },
        { provide: APP_PIPE, useValue: createAppValidationPipe() },
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  // ── create ──────────────────────────────────────────────────────────────────

  describe('profile creation', () => {
    const create = (user: TestUser, body: unknown) =>
      request(app.getHttpServer()).post('/user/profile').set('x-user', asUser(user)).send(body);

    it('creates a mentor profile and grants the mentor role', async () => {
      await create(asMentor, { profileType: ProfileType.MENTOR, mentor: mentorBody }).expect(201);

      expect(rbac.assignRole).toHaveBeenCalledWith(mentorUser, 'mentor');
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ event: expect.stringContaining('profile') }),
      );
    });

    it('creates a mentee profile and grants the mentee role', async () => {
      await create(asMentee, { profileType: ProfileType.MENTEE, mentee: menteeBody }).expect(201);

      expect(rbac.assignRole).toHaveBeenCalledWith(menteeUser, 'mentee');
    });

    it('rejects a create with no profile type', async () => {
      const res = await create(asMentor, { mentor: mentorBody }).expect(400);
      expect(res.body.details).toEqual([expect.objectContaining({ field: 'profileType' })]);
    });

    it('rejects an unknown profile type', async () => {
      await create(asMentor, { profileType: 'wizard', mentor: mentorBody }).expect(400);
    });

    it('validates nested mentor fields, not just the top level', async () => {
      const res = await create(asMentor, {
        profileType: ProfileType.MENTOR,
        mentor: { ...mentorBody, hourlyRate: 100_000 },
      }).expect(400);

      expect(res.body.details).toEqual([expect.objectContaining({ field: 'mentor.hourlyRate' })]);
    });

    it('rejects a duplicate mentor profile with 409', async () => {
      const res = await create(asMentor, { profileType: ProfileType.MENTOR, mentor: mentorBody }).expect(409);
      expect(res.body.message).toBe('Mentor profile already exists');
    });

    it('404s when the user does not exist', async () => {
      const res = await create({ sub: unknownUser, roles: ['mentor'] }, {
        profileType: ProfileType.MENTOR,
        mentor: mentorBody,
      }).expect(404);

      expect(res.body.message).toBe('User not found');
    });

    it('requires authentication', async () => {
      await request(app.getHttpServer())
        .post('/user/profile')
        .send({ profileType: ProfileType.MENTOR, mentor: mentorBody })
        .expect(401);
    });
  });

  // ── update ──────────────────────────────────────────────────────────────────

  describe('profile update', () => {
    const patch = (user: TestUser, type: string, body: unknown, query = '') =>
      request(app.getHttpServer())
        .patch(`/user/profile/${type}`)
        .set('x-user', asUser(user))
        .query(query)
        .send(body);

    it('updates the caller own mentor profile', async () => {
      await patch(asMentor, ProfileType.MENTOR, { hourlyRate: 120 }).expect(200);
    });

    it('bumps the profile version so revisions can be told apart', async () => {
      await patch(asMentor, ProfileType.MENTOR, { hourlyRate: 120 }).expect(200);

      const saved = mentorProfiles.save.mock.calls.at(-1)?.[0] as MentorProfile;
      expect(saved.profileVersion).toBe(2);
    });

    it('rejects an unknown profile type in the path', async () => {
      await patch(asMentor, 'wizard', { hourlyRate: 120 }).expect(400);
    });

    it('refuses a mentee editing a mentor profile', async () => {
      const res = await patch(asMentee, ProfileType.MENTOR, { hourlyRate: 120 }).expect(403);
      expect(res.body.message).toContain('mentor');
    });

    it('lets an admin edit another user profile by passing userId', async () => {
      await patch(asAdmin, ProfileType.MENTOR, { hourlyRate: 120 }, `userId=${mentorUser}`).expect(200);
    });

    it('rejects an hourly rate above the entity maximum', async () => {
      const res = await patch(asMentor, ProfileType.MENTOR, { hourlyRate: 100_000 }).expect(400);
      expect(res.body.details).toEqual([expect.objectContaining({ field: 'hourlyRate' })]);
    });
  });

  // ── public access and completeness ──────────────────────────────────────────

  describe('public profile', () => {
    it('is readable without authentication', async () => {
      const res = await request(app.getHttpServer()).get(`/profiles/${mentorUser}`).expect(200);

      expect(res.body.userId).toBe(mentorUser);
      expect(res.body.profileType).toBe(ProfileType.MENTOR);
    });

    it('computes a completeness score', async () => {
      const res = await request(app.getHttpServer()).get(`/profiles/${mentorUser}`).expect(200);
      expect(res.body.profileCompleteness).toBe(100);
    });

    it('caches the rendered profile in redis', async () => {
      await request(app.getHttpServer()).get(`/profiles/${mentorUser}`).expect(200);
      expect(redis.has(`public-profile:${mentorUser}`)).toBe(true);
    });

    it('serves a cache hit without querying the database again', async () => {
      await request(app.getHttpServer()).get(`/profiles/${mentorUser}`).expect(200);
      users.findOne.mockClear();

      await request(app.getHttpServer()).get(`/profiles/${mentorUser}`).expect(200);
      expect(users.findOne).not.toHaveBeenCalled();
    });

    it('404s for a user with no profile', async () => {
      const res = await request(app.getHttpServer()).get(`/profiles/${unknownUser}`).expect(404);
      expect(res.body.message).toBe('Profile not found');
    });
  });

  // ── search and pagination ───────────────────────────────────────────────────

  describe('search and pagination', () => {
    it('returns the paginated envelope', async () => {
      search.search.mockResolvedValue({ data: [{ id: mentorUser }], total: 1, page: 1, limit: 20, totalPages: 1 });

      const res = await request(app.getHttpServer()).get('/users').query({ page: 1, limit: 20 }).expect(200);

      expect(res.body).toMatchObject({ total: 1, page: 1, limit: 20, totalPages: 1 });
      expect(search.search).toHaveBeenCalledWith(expect.objectContaining({ page: 1, limit: 20 }));
    });

    it('coerces string query params to numbers', async () => {
      await request(app.getHttpServer()).get('/users').query({ page: '3', limit: '5' }).expect(200);
      expect(search.search).toHaveBeenCalledWith(expect.objectContaining({ page: 3, limit: 5 }));
    });

    it('is reachable without authentication', async () => {
      await request(app.getHttpServer()).get('/users').expect(200);
    });

    it('rejects a limit above the documented maximum', async () => {
      const res = await request(app.getHttpServer()).get('/users').query({ limit: 101 }).expect(400);
      expect(res.body.details).toEqual([expect.objectContaining({ field: 'limit' })]);
    });

    it('rejects a page below 1', async () => {
      await request(app.getHttpServer()).get('/users').query({ page: 0 }).expect(400);
    });

    it('rejects an unknown sort column', async () => {
      await request(app.getHttpServer()).get('/users').query({ sortBy: 'popularity' }).expect(400);
    });

    it('rejects an unknown sort order', async () => {
      await request(app.getHttpServer()).get('/users').query({ sortOrder: 'sideways' }).expect(400);
    });

    it('rejects an unknown role filter', async () => {
      await request(app.getHttpServer()).get('/users').query({ role: 'wizard' }).expect(400);
    });
  });

  // ── soft delete and restore ─────────────────────────────────────────────────

  describe('soft delete and restore', () => {
    it('lets a user soft delete their own account', async () => {
      await request(app.getHttpServer())
        .delete('/user/account')
        .set('x-user', asUser(asMentee))
        .expect(200);

      expect(account.softDelete).toHaveBeenCalledWith(menteeUser);
    });

    it('lets a user restore their own account', async () => {
      await request(app.getHttpServer())
        .post('/user/account/restore')
        .set('x-user', asUser(asMentee))
        .expect(200);

      expect(account.restore).toHaveBeenCalledWith(menteeUser);
    });

    it('requires authentication to delete an account', async () => {
      await request(app.getHttpServer()).delete('/user/account').expect(401);
    });

    it('restores a soft-deleted account as an admin', async () => {
      const res = await request(app.getHttpServer())
        .post(`/admin/users/${menteeUser}/restore`)
        .set('x-user', asUser(asAdmin))
        .expect(200);

      expect(account.restore).toHaveBeenCalledWith(menteeUser);
      expect(res.body.status).toBe('active');
    });

    it('refuses a restore for a non-admin', async () => {
      const res = await request(app.getHttpServer())
        .post(`/admin/users/${menteeUser}/restore`)
        .set('x-user', asUser(asMentee))
        .expect(403);

      expect(res.body.message).toBe('Insufficient role');
      expect(account.restore).not.toHaveBeenCalled();
    });

    it('refuses a restore for an unauthenticated caller', async () => {
      await request(app.getHttpServer()).post(`/admin/users/${menteeUser}/restore`).expect(401);
    });

    it('lists soft-deleted accounts for an admin', async () => {
      await request(app.getHttpServer())
        .get('/admin/users/deleted')
        .set('x-user', asUser(asAdmin))
        .expect(200);

      expect(account.listDeleted).toHaveBeenCalledWith(1, 20);
    });

    it('validates the list-deleted paging parameters', async () => {
      await request(app.getHttpServer())
        .get('/admin/users/deleted')
        .set('x-user', asUser(asAdmin))
        .query({ page: 0 })
        .expect(400);
    });

    it('rejects a non-uuid id in the restore path', async () => {
      await request(app.getHttpServer())
        .post('/admin/users/not-a-uuid/restore')
        .set('x-user', asUser(asAdmin))
        .expect(400);
    });
  });

  // ── avatar upload ───────────────────────────────────────────────────────────

  describe('avatar upload', () => {
    const attach = (user: TestUser | null) => {
      const req = request(app.getHttpServer()).post('/user/avatar');
      if (user) req.set('x-user', asUser(user));
      return req.attach('file', TINY_PNG, { filename: 'avatar.png', contentType: 'image/png' });
    };

    it('accepts a mock file and returns every derived size', async () => {
      const res = await attach(asMentee).expect(201);

      expect(res.body).toMatchObject({
        avatarUrl: 'https://cdn.test/full.png',
        avatarThumbnailUrl: 'https://cdn.test/thumb.png',
        avatarSmallUrl: 'https://cdn.test/small.png',
        avatarMediumUrl: 'https://cdn.test/medium.png',
      });
      expect(avatar.uploadAvatar).toHaveBeenCalledWith(menteeUser, expect.anything());
    });

    it('requires authentication', async () => {
      await attach(null).expect(401);
    });
  });
});