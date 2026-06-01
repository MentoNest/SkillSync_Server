import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import * as path from 'path';
import { AppModule } from '../../../src/app.module';
import {
  registerMentor,
  registerMentee,
  createProfile,
  getMockImagePath,
  ensureFixtures,
} from './helpers/profile.helpers';
import { DataSource } from 'typeorm';

describe('Profile File Uploads (E2E)', () => {
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

  // ── AVATAR UPLOAD ────────────────────────────────────────────────────────────

  describe('POST /users/profile/avatar', () => {
    it('mentor can upload a valid JPEG avatar', async () => {
      const { token, userId } = await registerMentor(app);
      await createProfile(app, token);

      const res = await request(app.getHttpServer())
        .post('/users/profile/avatar')
        .set('Authorization', `Bearer ${token}`)
        .attach('avatar', getMockImagePath('avatar.jpg'))
        .expect(200);

      expect(res.body.avatarUrl).toBeDefined();
      expect(typeof res.body.avatarUrl).toBe('string');
      expect(res.body.avatarUrl).toMatch(/^https?:\/\//);
    });

    it('mentee can upload a valid JPEG avatar', async () => {
      const { token } = await registerMentee(app);
      await createProfile(app, token);

      const res = await request(app.getHttpServer())
        .post('/users/profile/avatar')
        .set('Authorization', `Bearer ${token}`)
        .attach('avatar', getMockImagePath('avatar.jpg'))
        .expect(200);

      expect(res.body.avatarUrl).toBeDefined();
    });

    it('rejects upload of unsupported file type (PDF)', async () => {
      const { token } = await registerMentor(app);
      await createProfile(app, token);

      const res = await request(app.getHttpServer())
        .post('/users/profile/avatar')
        .set('Authorization', `Bearer ${token}`)
        .attach('avatar', getMockImagePath('document.pdf'))
        .expect(400);

      expect(res.body.message).toMatch(/file type|mime|format/i);
    });

    it('rejects upload exceeding the max file size', async () => {
      const { token } = await registerMentor(app);
      await createProfile(app, token);

      const res = await request(app.getHttpServer())
        .post('/users/profile/avatar')
        .set('Authorization', `Bearer ${token}`)
        .attach('avatar', getMockImagePath('oversized.jpg'))
        .expect(400);

      expect(res.body.message).toMatch(/size|large|limit/i);
    });

    it('rejects upload with missing file field', async () => {
      const { token } = await registerMentor(app);
      await createProfile(app, token);

      await request(app.getHttpServer())
        .post('/users/profile/avatar')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });

    it('rejects unauthenticated avatar upload', async () => {
      await request(app.getHttpServer())
        .post('/users/profile/avatar')
        .attach('avatar', getMockImagePath('avatar.jpg'))
        .expect(401);
    });

    it('returns 404 when user has no profile yet', async () => {
      const { token } = await registerMentor(app);

      await request(app.getHttpServer())
        .post('/users/profile/avatar')
        .set('Authorization', `Bearer ${token}`)
        .attach('avatar', getMockImagePath('avatar.jpg'))
        .expect(404);
    });

    it('uploading a new avatar replaces the old avatarUrl', async () => {
      const { token, userId } = await registerMentor(app);
      await createProfile(app, token);

      const first = await request(app.getHttpServer())
        .post('/users/profile/avatar')
        .set('Authorization', `Bearer ${token}`)
        .attach('avatar', getMockImagePath('avatar.jpg'))
        .expect(200);

      const second = await request(app.getHttpServer())
        .post('/users/profile/avatar')
        .set('Authorization', `Bearer ${token}`)
        .attach('avatar', getMockImagePath('avatar.jpg'))
        .expect(200);

      // Both should return a URL; in a real scenario the URL would differ
      expect(second.body.avatarUrl).toBeDefined();
      // Verify the profile reflects the new URL
      const profileRes = await request(app.getHttpServer())
        .get(`/users/${userId}/profile`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(profileRes.body.avatarUrl).toBe(second.body.avatarUrl);
    });
  });

  // ── AVATAR DELETE ────────────────────────────────────────────────────────────

  describe('DELETE /users/profile/avatar', () => {
    it('owner can remove their avatar', async () => {
      const { token, userId } = await registerMentor(app);
      await createProfile(app, token);

      await request(app.getHttpServer())
        .post('/users/profile/avatar')
        .set('Authorization', `Bearer ${token}`)
        .attach('avatar', getMockImagePath('avatar.jpg'))
        .expect(200);

      await request(app.getHttpServer())
        .delete('/users/profile/avatar')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const profileRes = await request(app.getHttpServer())
        .get(`/users/${userId}/profile`)
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      expect(profileRes.body.avatarUrl).toBeNull();
    });

    it('returns 400 when no avatar exists to delete', async () => {
      const { token } = await registerMentor(app);
      await createProfile(app, token);

      await request(app.getHttpServer())
        .delete('/users/profile/avatar')
        .set('Authorization', `Bearer ${token}`)
        .expect(400);
    });

    it('rejects unauthenticated avatar delete', async () => {
      await request(app.getHttpServer())
        .delete('/users/profile/avatar')
        .expect(401);
    });
  });
});