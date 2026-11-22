import {
  INestApplication,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import {
  getDataSourceToken,
  getRepositoryToken,
  TypeOrmModule,
} from '@nestjs/typeorm';
import request from 'supertest';
import type { DataSource, Repository } from 'typeorm';
import { Role } from '../src/auth/auth.types';
import { JwtAuthGuard } from '../src/auth/guards/jwt-auth.guard';
import { RolesGuard } from '../src/auth/guards/roles.guard';
import { AllExceptionsFilter } from '../src/common/filters/all-exceptions.filter';
import { createValidationPipe } from '../src/common/filters/validation';
import { MenteeProfile } from '../src/profile/mentee-profile.entity';
import { MentorProfile } from '../src/profile/mentor-profile.entity';
import { ProfileController } from '../src/profile/profile.controller';
import { ProfileType } from '../src/profile/dto/create-profile.dto';
import { ProfileService } from '../src/profile/profile.service';
import { ProfileHistory } from '../src/profile-history/profile-history.entity';
import { ProfileHistoryService } from '../src/profile-history/profile-history.service';
import { PortfolioLink } from '../src/user/portfolio-link.entity';
import { PortfolioLinksController } from '../src/user/portfolio-links.controller';
import { PortfolioLinksService } from '../src/user/portfolio-links.service';
import { RoleEntity } from '../src/user/role.entity';
import { User } from '../src/user/user.entity';
import { UserStatus } from '../src/user/user-status.enum';
import { UserController } from '../src/user/user.controller';
import { UserService } from '../src/user/user.service';

const ALICE = 'GDQP2KPQGKIHYJGXNUIYOMHARUARCA7DJT5FO2FFOOKY3B2WSQHG4W37';
const BOB = 'GCEZWKCA5VLDNRLN3RPRJMRZOX3Z6G5CHCGFM34TPTJKH3CRBJ1J9DEC';
const CAROL = 'GAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';

const databaseUrl =
  process.env.TEST_DATABASE_URL ??
  'postgresql://skillsync:skillsync_test@localhost:5433/skillsync_test';

describe('Profile endpoints (database-backed e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let users: Repository<User>;

  const auth = (wallet: string, roles: Role[] = [Role.USER]) => ({
    'x-test-user': wallet,
    'x-test-roles': roles.join(','),
  });

  const seedUser = async (wallet: string, overrides: Partial<User> = {}) => {
    const user = users.create({
      walletAddress: wallet,
      email: null,
      username: null,
      displayName: null,
      status: UserStatus.ACTIVE,
      avatarUrl: null,
      timezone: 'UTC',
      locale: 'en',
      usernameChangedAt: null,
      lastLoginAt: null,
      deletedAt: null,
      ...overrides,
    });
    return users.save(user);
  };

  const resetDatabase = async () => {
    await dataSource.query(
      'TRUNCATE TABLE profile_history, user_roles, portfolio_links, mentor_profiles, mentee_profiles, users, roles RESTART IDENTITY CASCADE',
    );
  };

  beforeAll(async () => {
    process.env.NODE_ENV = 'test';

    const moduleRef = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'postgres',
          url: databaseUrl,
          entities: [
            User,
            RoleEntity,
            PortfolioLink,
            MentorProfile,
            MenteeProfile,
            ProfileHistory,
          ],
          synchronize: true,
          dropSchema: true,
          logging: false,
        }),
        TypeOrmModule.forFeature([
          User,
          RoleEntity,
          PortfolioLink,
          MentorProfile,
          MenteeProfile,
          ProfileHistory,
        ]),
      ],
      controllers: [UserController, ProfileController, PortfolioLinksController],
      providers: [
        UserService,
        ProfileService,
        PortfolioLinksService,
        ProfileHistoryService,
        ConfigService,
        Reflector,
        RolesGuard,
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (context: any) => {
          const req = context.switchToHttp().getRequest();
          const address = req.headers['x-test-user'];
          if (typeof address !== 'string') throw new UnauthorizedException();
          const roles = typeof req.headers['x-test-roles'] === 'string'
            ? (req.headers['x-test-roles'] as string).split(',').filter(Boolean)
            : [];
          req.user = { address, roles: roles as Role[], jti: 'e2e-jti' };
          return true;
        },
      })
      .compile();

    app = moduleRef.createNestApplication();
    app.useGlobalPipes(createValidationPipe());
    app.useGlobalFilters(new AllExceptionsFilter(false));
    await app.init();

    dataSource = app.get<DataSource>(getDataSourceToken());
    users = app.get<Repository<User>>(getRepositoryToken(User));
  });

  afterEach(async () => {
    await resetDatabase();
  });

  afterAll(async () => {
    await app.close();
  });

  it('creates a mentor profile with real SQL and records creation history', async () => {
    await seedUser(ALICE, { username: 'alice_dev', displayName: 'Alice' });

    const response = await request(app.getHttpServer())
      .post('/user/profile')
      .set(auth(ALICE))
      .send({
        profileType: ProfileType.MENTOR,
        bio: 'Senior engineer with a decade of distributed systems experience.',
        skills: ['TypeScript', 'NestJS'],
      })
      .expect(201);

    expect(response.body.profileType).toBe(ProfileType.MENTOR);
    expect(response.body.profile).toMatchObject({
      walletAddress: ALICE,
      skills: ['TypeScript', 'NestJS'],
      maxMentees: 3,
      languages: ['English'],
      isActive: true,
    });

    const stored = await dataSource.getRepository(MentorProfile).findOneBy({ walletAddress: ALICE });
    expect(stored).not.toBeNull();

    // Profile history is intentionally non-blocking; give the insert a tick to settle.
    await new Promise((resolve) => setImmediate(resolve));
    const history = await dataSource.getRepository(ProfileHistory).count({ where: { userId: ALICE } });
    expect(history).toBeGreaterThan(0);
  });

  it('creates a mentee profile and rejects invalid or duplicate mentor payloads', async () => {
    await seedUser(BOB, { username: 'bob_dev' });

    await request(app.getHttpServer())
      .post('/user/profile')
      .set(auth(BOB))
      .send({
        profileType: ProfileType.MENTEE,
        learningGoals: 'I want to move from backend engineering into platform work.',
        interests: ['Kubernetes'],
        experienceLevel: 'intermediate',
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/user/profile')
      .set(auth(ALICE))
      .send({ profileType: ProfileType.MENTOR, bio: 'short', skills: [] })
      .expect(400)
      .expect(({ body }) => {
        expect(body.code).toBe('VALIDATION_FAILED');
        expect(body.errors.map((error: { field: string }) => error.field)).toEqual(
          expect.arrayContaining(['bio', 'skills']),
        );
      });

    await seedUser(ALICE);
    await request(app.getHttpServer())
      .post('/user/profile')
      .set(auth(ALICE))
      .send({
        profileType: ProfileType.MENTOR,
        bio: 'A sufficiently long mentor biography for validation.',
        skills: ['TypeScript'],
      })
      .expect(201);

    await request(app.getHttpServer())
      .post('/user/profile')
      .set(auth(ALICE))
      .send({
        profileType: ProfileType.MENTOR,
        bio: 'A sufficiently long mentor biography for validation.',
        skills: ['TypeScript'],
      })
      .expect(409);
  });

  it('updates profile fields and exposes them on the unauthenticated public profile', async () => {
    await seedUser(ALICE, { username: 'alice_dev' });

    await request(app.getHttpServer())
      .patch('/user/username')
      .set(auth(ALICE))
      .send({ username: 'Alice_Dev' })
      .expect(200);

    await request(app.getHttpServer())
      .patch('/user/display-name')
      .set(auth(ALICE))
      .send({ displayName: 'Alice the Mentor' })
      .expect(200);

    // Simulates the URL returned by an avatar file upload without needing image storage.
    await request(app.getHttpServer())
      .patch('/users/me')
      .set(auth(ALICE))
      .send({
        avatarUrl: 'https://uploads.test/avatars/alice.png',
        timezone: 'Europe/London',
        locale: 'en-GB',
      })
      .expect(200);

    await request(app.getHttpServer())
      .post('/user/portfolio-links')
      .set(auth(ALICE))
      .send({ url: 'https://github.com/alice', platform: 'github', displayTitle: 'GitHub' })
      .expect(201);

    const response = await request(app.getHttpServer())
      .get('/profiles/alice_dev')
      .expect(200);

    expect(response.body).toMatchObject({
      walletAddress: ALICE,
      username: 'alice_dev',
      displayName: 'Alice the Mentor',
    });
    expect(response.body.portfolioLinks).toHaveLength(1);

    await request(app.getHttpServer()).get('/profiles/missing_user').expect(404);
  });

  it('filters and paginates users using real SQL', async () => {
    await seedUser(ALICE, { username: 'alice_dev', displayName: 'Alice' });
    await seedUser(BOB, { username: 'bob_dev', displayName: 'Bob' });
    await seedUser(CAROL, {
      username: 'carol_mentor',
      displayName: 'Carol',
      status: UserStatus.SUSPENDED,
    });

    const active = await request(app.getHttpServer())
      .get('/users')
      .set(auth(ALICE))
      .query({ status: UserStatus.ACTIVE, search: 'dev', page: 1, limit: 1 })
      .expect(200);

    expect(active.body).toMatchObject({ total: 2, page: 1, limit: 1 });
    expect(active.body.data).toHaveLength(1);
    expect(active.body.data[0].username).toBe('bob_dev');

    const suspended = await request(app.getHttpServer())
      .get('/users')
      .set(auth(ALICE))
      .query({ status: UserStatus.SUSPENDED })
      .expect(200);
    expect(suspended.body.data.map((user: { username: string }) => user.username)).toEqual([
      'carol_mentor',
    ]);
  });

  it('requires a token and enforces admin roles for status changes', async () => {
    await seedUser(ALICE, { username: 'alice_dev' });

    await request(app.getHttpServer())
      .patch(`/admin/users/${ALICE}/status`)
      .send({ status: UserStatus.SUSPENDED })
      .expect(401);

    await request(app.getHttpServer())
      .patch(`/admin/users/${ALICE}/status`)
      .set(auth(BOB, [Role.USER]))
      .send({ status: UserStatus.SUSPENDED })
      .expect(403);

    const response = await request(app.getHttpServer())
      .patch(`/admin/users/${ALICE}/status`)
      .set(auth(BOB, [Role.ADMIN]))
      .send({ status: UserStatus.SUSPENDED })
      .expect(200);
    expect(response.body.status).toBe(UserStatus.SUSPENDED);
  });

  it('soft deletes a profile and lets an admin restore it', async () => {
    await seedUser(ALICE, { username: 'alice_dev', displayName: 'Alice' });

    await request(app.getHttpServer()).delete('/users/me').set(auth(ALICE)).expect(204);
    await request(app.getHttpServer()).get('/profiles/alice_dev').expect(404);
    await request(app.getHttpServer()).get('/users').set(auth(ALICE)).expect(200, {
      data: [],
      total: 0,
      page: 1,
      limit: 20,
    });

    await request(app.getHttpServer())
      .patch(`/admin/users/${ALICE}/status`)
      .set(auth(BOB, [Role.ADMIN]))
      .send({ status: UserStatus.ACTIVE })
      .expect(200);

    await request(app.getHttpServer()).get('/profiles/alice_dev').expect(200);
  });

  it('prevents one user from deleting another user portfolio link but allows an admin', async () => {
    await seedUser(ALICE);
    await seedUser(BOB);

    const created = await request(app.getHttpServer())
      .post('/user/portfolio-links')
      .set(auth(ALICE))
      .send({ url: 'https://github.com/alice', platform: 'github' })
      .expect(201);

    await request(app.getHttpServer())
      .delete(`/user/portfolio-links/${created.body.id}`)
      .set(auth(BOB))
      .expect(404);

    await request(app.getHttpServer())
      .delete(`/admin/portfolio-links/${created.body.id}`)
      .set(auth(BOB, [Role.ADMIN]))
      .expect(204);
  });
});
