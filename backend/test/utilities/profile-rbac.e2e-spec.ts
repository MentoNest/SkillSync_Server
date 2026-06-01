import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../../src/app.module';
import {
  registerMentor,
  registerMentee,
  registerAdmin,
  createProfile,
  ensureFixtures,
} from './helpers/profile.helpers';
import { DataSource } from 'typeorm';

describe('Profile RBAC & Public Access (E2E)', () => {
  let app: INestApplication;
  let dataSource: DataSource;

  beforeAll(async () => {
    ensureFixtures();

    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({ whitelist: true, transform: true }),
    );
    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);
  });

  afterAll(async () => {
    await dataSource.query(
      `DELETE FROM users WHERE email LIKE '%@test.com'`,
    );
    await app.close();
  });

  // ── PUBLIC PROFILE ACCESS ────────────────────────────────────────────────────

  describe('Public profile endpoints (unauthenticated)', () => {
    it('GET /users/:id/profile — public access returns profile', async () => {
      const { token, userId } = await registerMentor(app);
      await createProfile(app, token, { bio: 'Public mentor.' });

      const res = await request(app.getHttpServer())
        .get(`/users/${userId}/profile`)
        .expect(200);

      expect(res.body.bio).toBe('Public mentor.');
    });

    it('GET /users/:id/profile — omits sensitive fields for unauthenticated viewer', async () => {
      const { token, userId } = await registerMentor(app);
      await createProfile(app, token);

      const res = await request(app.getHttpServer())
        .get(`/users/${userId}/profile`)
        .expect(200);

      expect(res.body.email).toBeUndefined();
      expect(res.body.password).toBeUndefined();
      expect(res.body.hashedPassword).toBeUndefined();
    });

    it('GET /users/featured — publicly accessible without auth', async () => {
      const res = await request(app.getHttpServer())
        .get('/users/featured')
        .expect(200);

      expect(Array.isArray(res.body)).toBe(true);
    });

    it('GET /users/search — publicly accessible without auth', async () => {
      const res = await request(app.getHttpServer())
        .get('/users/search')
        .query({ skills: 'TypeScript' })
        .expect(200);

      expect(res.body).toBeDefined();
    });
  });

  // ── MENTOR-SPECIFIC FIELDS ───────────────────────────────────────────────────

  describe('Mentor vs mentee field differences', () => {
    it('mentor profile includes hourlyRate field', async () => {
      const { token, userId } = await registerMentor(app);
      await createProfile(app, token, { hourlyRate: 95 });

      const res = await request(app.getHttpServer())
        .get(`/users/${userId}/profile`)
        .expect(200);

      expect(res.body.hourlyRate).toBe(95);
    });

    it('mentee creating profile without hourlyRate is accepted', async () => {
      const { token, userId } = await registerMentee(app);
      await createProfile(app, token, { hourlyRate: undefined });

      const res = await request(app.getHttpServer())
        .get(`/users/${userId}/profile`)
        .expect(200);

      // hourlyRate should be null or absent for mentees
      expect(res.body.hourlyRate == null).toBe(true);
    });

    it('mentee cannot set featuredMentor flag', async () => {
      const { token } = await registerMentee(app);
      await createProfile(app, token);

      await request(app.getHttpServer())
        .patch('/users/profile')
        .set('Authorization', `Bearer ${token}`)
        .send({ isFeatured: true })
        .expect(403);
    });
  });

  // ── ROLE-BASED ADMIN OPERATIONS ──────────────────────────────────────────────

  describe('Admin role operations', () => {
    it('admin can view any user profile', async () => {
      const mentor = await registerMentor(app);
      await createProfile(app, mentor.token, { bio: 'Admin should see this.' });

      const admin = await registerAdmin(app);

      const res = await request(app.getHttpServer())
        .get(`/users/${mentor.userId}/profile`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);

      expect(res.body.bio).toBe('Admin should see this.');
    });

    it('admin can update any user profile', async () => {
      const mentor = await registerMentor(app);
      await createProfile(app, mentor.token, { bio: 'Original.' });

      const admin = await registerAdmin(app);

      const res = await request(app.getHttpServer())
        .patch(`/users/${mentor.userId}/profile`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ bio: 'Admin override.' })
        .expect(200);

      expect(res.body.bio).toBe('Admin override.');
    });

    it('admin can soft-delete any user profile', async () => {
      const mentor = await registerMentor(app);
      await createProfile(app, mentor.token);

      const admin = await registerAdmin(app);

      await request(app.getHttpServer())
        .delete(`/users/${mentor.userId}/profile`)
        .set('Authorization', `Bearer ${admin.token}`)
        .expect(200);
    });

    it('admin can set featuredMentor flag', async () => {
      const mentor = await registerMentor(app);
      await createProfile(app, mentor.token);

      const admin = await registerAdmin(app);

      const res = await request(app.getHttpServer())
        .patch(`/users/${mentor.userId}/profile`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ isFeatured: true })
        .expect(200);

      expect(res.body.isFeatured).toBe(true);
    });

    it('non-admin cannot access admin-only endpoints', async () => {
      const mentee = await registerMentee(app);

      await request(app.getHttpServer())
        .get('/admin/users')
        .set('Authorization', `Bearer ${mentee.token}`)
        .expect(403);
    });
  });

  // ── FEATURED MENTOR ──────────────────────────────────────────────────────────

  describe('GET /users/featured', () => {
    it('returns only featured mentors', async () => {
      const admin = await registerAdmin(app);

      // Create featured mentor
      const featured = await registerMentor(app);
      await createProfile(app, featured.token, {
        bio: 'Featured mentor profile.',
        skills: ['Python'],
      });
      await request(app.getHttpServer())
        .patch(`/users/${featured.userId}/profile`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ isFeatured: true })
        .expect(200);

      // Create non-featured mentor
      const regular = await registerMentor(app);
      await createProfile(app, regular.token, {
        bio: 'Regular mentor.',
        skills: ['Java'],
      });

      const res = await request(app.getHttpServer())
        .get('/users/featured')
        .expect(200);

      const ids = res.body.map((u: any) => u.id ?? u.userId);
      expect(ids).toContain(featured.userId);
      expect(ids).not.toContain(regular.userId);
    });

    it('featured list only contains mentors (not mentees)', async () => {
      const res = await request(app.getHttpServer())
        .get('/users/featured')
        .expect(200);

      for (const user of res.body) {
        expect(user.role).toBe('mentor');
      }
    });

    it('featured list respects pagination', async () => {
      const res = await request(app.getHttpServer())
        .get('/users/featured')
        .query({ page: 1, limit: 2 })
        .expect(200);

      expect(Array.isArray(res.body.data ?? res.body)).toBe(true);

      const items = res.body.data ?? res.body;
      expect(items.length).toBeLessThanOrEqual(2);
    });

    it('removing featured flag removes user from featured list', async () => {
      const admin = await registerAdmin(app);
      const mentor = await registerMentor(app);
      await createProfile(app, mentor.token);

      await request(app.getHttpServer())
        .patch(`/users/${mentor.userId}/profile`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ isFeatured: true })
        .expect(200);

      await request(app.getHttpServer())
        .patch(`/users/${mentor.userId}/profile`)
        .set('Authorization', `Bearer ${admin.token}`)
        .send({ isFeatured: false })
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/users/featured')
        .expect(200);

      const ids = (res.body.data ?? res.body).map((u: any) => u.id ?? u.userId);
      expect(ids).not.toContain(mentor.userId);
    });
  });
});