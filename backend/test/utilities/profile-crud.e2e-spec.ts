import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../../src/app.module';
import {
  registerMentor,
  registerMentee,
  registerAdmin,
  createProfile,
  getProfile,
  updateProfile,
  ensureFixtures,
} from './helpers/profile.helpers';
import { DataSource } from 'typeorm';

describe('Profile CRUD (E2E)', () => {
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

  // ── CREATE PROFILE ──────────────────────────────────────────────────────────

  describe('POST /users/profile', () => {
    it('mentor can create their own profile', async () => {
      const { token, userId } = await registerMentor(app);

      const res = await request(app.getHttpServer())
        .post('/users/profile')
        .set('Authorization', `Bearer ${token}`)
        .send({
          bio: 'Senior engineer with 12 years experience.',
          skills: ['TypeScript', 'React', 'AWS'],
          hourlyRate: 120,
          timezone: 'America/New_York',
          languages: ['English', 'Spanish'],
          title: 'Senior Software Engineer',
          yearsOfExperience: 12,
        })
        .expect(201);

      expect(res.body).toMatchObject({
        bio: 'Senior engineer with 12 years experience.',
        skills: expect.arrayContaining(['TypeScript', 'React', 'AWS']),
        hourlyRate: 120,
        userId,
      });
      expect(res.body.id).toBeDefined();
      expect(res.body.createdAt).toBeDefined();
    });

    it('mentee can create their own profile', async () => {
      const { token } = await registerMentee(app);

      const res = await request(app.getHttpServer())
        .post('/users/profile')
        .set('Authorization', `Bearer ${token}`)
        .send({
          bio: 'Junior developer looking for mentorship.',
          skills: ['JavaScript', 'HTML'],
          timezone: 'UTC',
          languages: ['English'],
        })
        .expect(201);

      expect(res.body.bio).toBe('Junior developer looking for mentorship.');
    });

    it('rejects unauthenticated profile creation', async () => {
      await request(app.getHttpServer())
        .post('/users/profile')
        .send({ bio: 'No auth', skills: [], timezone: 'UTC', languages: [] })
        .expect(401);
    });

    it('rejects profile with empty bio', async () => {
      const { token } = await registerMentor(app);

      const res = await request(app.getHttpServer())
        .post('/users/profile')
        .set('Authorization', `Bearer ${token}`)
        .send({
          bio: '',
          skills: ['TypeScript'],
          timezone: 'UTC',
          languages: ['English'],
        })
        .expect(400);

      expect(res.body.message).toEqual(
        expect.arrayContaining([expect.stringMatching(/bio/i)]),
      );
    });

    it('rejects profile with empty skills array', async () => {
      const { token } = await registerMentor(app);

      const res = await request(app.getHttpServer())
        .post('/users/profile')
        .set('Authorization', `Bearer ${token}`)
        .send({
          bio: 'Valid bio here.',
          skills: [],
          timezone: 'UTC',
          languages: ['English'],
        })
        .expect(400);

      expect(res.body.message).toEqual(
        expect.arrayContaining([expect.stringMatching(/skills/i)]),
      );
    });

    it('rejects negative hourlyRate', async () => {
      const { token } = await registerMentor(app);

      await request(app.getHttpServer())
        .post('/users/profile')
        .set('Authorization', `Bearer ${token}`)
        .send({
          bio: 'Valid bio.',
          skills: ['TypeScript'],
          timezone: 'UTC',
          languages: ['English'],
          hourlyRate: -50,
        })
        .expect(400);
    });

    it('rejects invalid linkedinUrl format', async () => {
      const { token } = await registerMentor(app);

      await request(app.getHttpServer())
        .post('/users/profile')
        .set('Authorization', `Bearer ${token}`)
        .send({
          bio: 'Valid bio.',
          skills: ['TypeScript'],
          timezone: 'UTC',
          languages: ['English'],
          linkedinUrl: 'not-a-url',
        })
        .expect(400);
    });

    it('prevents creating a second profile for the same user', async () => {
      const { token } = await registerMentor(app);

      await createProfile(app, token);

      await request(app.getHttpServer())
        .post('/users/profile')
        .set('Authorization', `Bearer ${token}`)
        .send({
          bio: 'Duplicate profile attempt.',
          skills: ['Go'],
          timezone: 'UTC',
          languages: ['English'],
        })
        .expect(409);
    });
  });

  // ── GET PROFILE ─────────────────────────────────────────────────────────────

  describe('GET /users/:id/profile', () => {
    it('owner can retrieve their own profile', async () => {
      const { token, userId } = await registerMentor(app);
      await createProfile(app, token, { bio: 'Owner profile.' });

      const res = await request(app.getHttpServer())
        .get(`/users/${userId}/profile`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.bio).toBe('Owner profile.');
      expect(res.body.userId).toBe(userId);
    });

    it('other authenticated user can view a public profile', async () => {
      const mentor = await registerMentor(app);
      await createProfile(app, mentor.token, { bio: 'Public mentor.' });

      const viewer = await registerMentee(app);

      const res = await request(app.getHttpServer())
        .get(`/users/${mentor.userId}/profile`)
        .set('Authorization', `Bearer ${viewer.token}`)
        .expect(200);

      expect(res.body.bio).toBe('Public mentor.');
    });

    it('unauthenticated user can view a public profile', async () => {
      const mentor = await registerMentor(app);
      await createProfile(app, mentor.token, { bio: 'Publicly visible.' });

      const res = await request(app.getHttpServer())
        .get(`/users/${mentor.userId}/profile`)
        .expect(200);

      expect(res.body.bio).toBe('Publicly visible.');
    });

    it('returns 404 for user without a profile', async () => {
      const { userId, token } = await registerMentor(app);

      await request(app.getHttpServer())
        .get(`/users/${userId}/profile`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('returns 404 for non-existent user id', async () => {
      const { token } = await registerMentee(app);

      await request(app.getHttpServer())
        .get(`/users/00000000-0000-0000-0000-000000000000/profile`)
        .set('Authorization', `Bearer ${token}`)
        .expect(404);
    });

    it('does NOT expose private fields (email, password) to other users', async () => {
      const mentor = await registerMentor(app);
      await createProfile(app, mentor.token);

      const viewer = await registerMentee(app);

      const res = await request(app.getHttpServer())
        .get(`/users/${mentor.userId}/profile`)
        .set('Authorization', `Bearer ${viewer.token}`)
        .expect(200);

      expect(res.body.password).toBeUndefined();
      expect(res.body.email).toBeUndefined();
    });
  });

  // ── UPDATE PROFILE ───────────────────────────────────────────────────────────

  describe('PATCH /users/profile', () => {
    it('owner can update their profile', async () => {
      const { token } = await registerMentor(app);
      await createProfile(app, token, { bio: 'Original bio.' });

      const res = await request(app.getHttpServer())
        .patch('/users/profile')
        .set('Authorization', `Bearer ${token}`)
        .send({ bio: 'Updated bio with more detail.' })
        .expect(200);

      expect(res.body.bio).toBe('Updated bio with more detail.');
    });

    it('partial update only changes provided fields', async () => {
      const { token } = await registerMentor(app);
      await createProfile(app, token, {
        bio: 'Original bio.',
        skills: ['TypeScript'],
        hourlyRate: 100,
      });

      const res = await request(app.getHttpServer())
        .patch('/users/profile')
        .set('Authorization', `Bearer ${token}`)
        .send({ hourlyRate: 150 })
        .expect(200);

      expect(res.body.hourlyRate).toBe(150);
      expect(res.body.bio).toBe('Original bio.');
      expect(res.body.skills).toContain('TypeScript');
    });

    it('cannot update another user profile', async () => {
      const mentor = await registerMentor(app);
      await createProfile(app, mentor.token);

      const attacker = await registerMentee(app);

      await request(app.getHttpServer())
        .patch(`/users/${mentor.userId}/profile`)
        .set('Authorization', `Bearer ${attacker.token}`)
        .send({ bio: 'Hacked bio.' })
        .expect(403);
    });

    it('rejects update with invalid skills type', async () => {
      const { token } = await registerMentor(app);
      await createProfile(app, token);

      await request(app.getHttpServer())
        .patch('/users/profile')
        .set('Authorization', `Bearer ${token}`)
        .send({ skills: 'not-an-array' })
        .expect(400);
    });

    it('returns 404 when updating profile that does not exist', async () => {
      const { token } = await registerMentor(app);

      await request(app.getHttpServer())
        .patch('/users/profile')
        .set('Authorization', `Bearer ${token}`)
        .send({ bio: 'No profile exists.' })
        .expect(404);
    });

    it('unauthenticated request cannot update profile', async () => {
      await request(app.getHttpServer())
        .patch('/users/profile')
        .send({ bio: 'No auth.' })
        .expect(401);
    });
  });

  // ── DELETE / SOFT DELETE ─────────────────────────────────────────────────────

  describe('DELETE /users/profile (soft delete)', () => {
    it('owner can soft-delete their profile', async () => {
      const { token, userId } = await registerMentor(app);
      await createProfile(app, token);

      await request(app.getHttpServer())
        .delete('/users/profile')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      // Profile no longer publicly visible
      await request(app.getHttpServer())
        .get(`/users/${userId}/profile`)
        .expect(404);
    });

    it('soft-deleted profile is not returned in search results', async () => {
      const { token } = await registerMentor(app);
      await createProfile(app, token, {
        bio: 'Unique ghost mentor bio xxyyzz.',
        skills: ['Rust'],
      });

      await request(app.getHttpServer())
        .delete('/users/profile')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const searchRes = await request(app.getHttpServer())
        .get('/users/search')
        .query({ skills: 'Rust', q: 'ghost mentor' })
        .expect(200);

      const bios = (searchRes.body.data ?? searchRes.body).map(
        (u: any) => u.profile?.bio,
      );
      expect(bios).not.toContain('Unique ghost mentor bio xxyyzz.');
    });

    it('cannot delete another user profile', async () => {
      const mentor = await registerMentor(app);
      await createProfile(app, mentor.token);

      const attacker = await registerMentee(app);

      await request(app.getHttpServer())
        .delete(`/users/${mentor.userId}/profile`)
        .set('Authorization', `Bearer ${attacker.token}`)
        .expect(403);
    });

    it('unauthenticated user cannot delete a profile', async () => {
      const { token, userId } = await registerMentor(app);
      await createProfile(app, token);

      await request(app.getHttpServer())
        .delete(`/users/${userId}/profile`)
        .expect(401);
    });

    it('admin can hard-delete any profile', async () => {
      const mentor = await registerMentor(app);
      await createProfile(app, mentor.token);

      const admin = await registerAdmin(app);

      await request(app.getHttpServer())
        .delete(`/users/${mentor.userId}/profile`)
        .set('Authorization', `Bearer ${admin.token}`)
        .query({ hard: true })
        .expect(200);

      await request(app.getHttpServer())
        .get(`/users/${mentor.userId}/profile`)
        .expect(404);
    });
  });

  // ── RESTORE ──────────────────────────────────────────────────────────────────

  describe('POST /users/profile/restore', () => {
    it('owner can restore a soft-deleted profile', async () => {
      const { token, userId } = await registerMentor(app);
      await createProfile(app, token, { bio: 'Will be restored.' });

      await request(app.getHttpServer())
        .delete('/users/profile')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      await request(app.getHttpServer())
        .post('/users/profile/restore')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const res = await request(app.getHttpServer())
        .get(`/users/${userId}/profile`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.bio).toBe('Will be restored.');
      expect(res.body.deletedAt).toBeNull();
    });

    it('cannot restore a profile that was never deleted', async () => {
      const { token } = await registerMentor(app);
      await createProfile(app, token);

      await request(app.getHttpServer())
        .post('/users/profile/restore')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });
  });

  // ── PROFILE COMPLETENESS ─────────────────────────────────────────────────────

  describe('GET /users/profile/completeness', () => {
    it('returns 0% for a minimal profile', async () => {
      const { token } = await registerMentor(app);
      await createProfile(app, token, {
        bio: 'Minimal.',
        skills: ['TypeScript'],
        timezone: 'UTC',
        languages: ['English'],
      });

      const res = await request(app.getHttpServer())
        .get('/users/profile/completeness')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.percentage).toBeGreaterThanOrEqual(0);
      expect(res.body.percentage).toBeLessThan(100);
      expect(res.body.missingFields).toBeDefined();
      expect(Array.isArray(res.body.missingFields)).toBe(true);
    });

    it('returns 100% when all fields are filled', async () => {
      const { token } = await registerMentor(app);
      await createProfile(app, token, {
        bio: 'Fully complete mentor profile for senior engineering.',
        skills: ['TypeScript', 'Node.js'],
        timezone: 'America/New_York',
        languages: ['English'],
        hourlyRate: 100,
        title: 'Staff Engineer',
        company: 'Acme Corp',
        yearsOfExperience: 10,
        linkedinUrl: 'https://linkedin.com/in/testuser',
        githubUrl: 'https://github.com/testuser',
        websiteUrl: 'https://example.com',
      });

      const res = await request(app.getHttpServer())
        .get('/users/profile/completeness')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(res.body.percentage).toBe(100);
      expect(res.body.missingFields).toHaveLength(0);
    });

    it('returns 401 for unauthenticated request', async () => {
      await request(app.getHttpServer())
        .get('/users/profile/completeness')
        .expect(401);
    });
  });
});