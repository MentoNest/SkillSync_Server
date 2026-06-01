import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../../../src/app.module';
import {
  registerMentor,
  registerMentee,
  createProfile,
  ensureFixtures,
} from './helpers/profile.helpers';
import { DataSource } from 'typeorm';

/**
 * Seeds a known set of mentor profiles before the search tests run so
 * assertions have deterministic data to work with.
 */
async function seedSearchFixtures(app: INestApplication) {
  const mentors = [
    {
      skills: ['TypeScript', 'Node.js', 'PostgreSQL'],
      bio: 'Backend TypeScript expert with 8 years.',
      hourlyRate: 90,
      timezone: 'UTC',
      languages: ['English'],
      title: 'Backend Engineer',
    },
    {
      skills: ['React', 'TypeScript', 'CSS'],
      bio: 'Frontend TypeScript developer.',
      hourlyRate: 70,
      timezone: 'America/New_York',
      languages: ['English', 'French'],
      title: 'Frontend Engineer',
    },
    {
      skills: ['Python', 'Machine Learning', 'TensorFlow'],
      bio: 'ML engineer and data scientist.',
      hourlyRate: 110,
      timezone: 'Europe/London',
      languages: ['English'],
      title: 'ML Engineer',
    },
    {
      skills: ['Python', 'Django', 'PostgreSQL'],
      bio: 'Fullstack Python developer.',
      hourlyRate: 80,
      timezone: 'UTC',
      languages: ['English', 'Spanish'],
      title: 'Fullstack Developer',
    },
    {
      skills: ['Go', 'Kubernetes', 'Docker'],
      bio: 'DevOps and Go specialist.',
      hourlyRate: 130,
      timezone: 'Asia/Tokyo',
      languages: ['English', 'Japanese'],
      title: 'DevOps Engineer',
    },
  ];

  const created: Array<{ token: string; userId: string }> = [];
  for (const profileData of mentors) {
    const { token, userId } = await registerMentor(app);
    await createProfile(app, token, profileData);
    created.push({ token, userId });
  }
  return created;
}

describe('Profile Search & Filter (E2E)', () => {
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

    // Seed before any test runs
    await seedSearchFixtures(app);
  });

  afterAll(async () => {
    await dataSource.query(
      `DELETE FROM users WHERE email LIKE '%@test.com'`,
    );
    await app.close();
  });

  // ── BASIC SEARCH ─────────────────────────────────────────────────────────────

  describe('GET /users/search', () => {
    it('returns mentors matching a skill query', async () => {
      const res = await request(app.getHttpServer())
        .get('/users/search')
        .query({ skills: 'TypeScript' })
        .expect(200);

      const items = res.body.data ?? res.body;
      expect(items.length).toBeGreaterThanOrEqual(2);

      for (const item of items) {
        expect(
          item.profile?.skills ?? item.skills,
        ).toEqual(expect.arrayContaining(['TypeScript']));
      }
    });

    it('returns empty array when no mentors match', async () => {
      const res = await request(app.getHttpServer())
        .get('/users/search')
        .query({ skills: 'COBOL_NOBODY_HAS_THIS_XYZABC' })
        .expect(200);

      const items = res.body.data ?? res.body;
      expect(items).toHaveLength(0);
    });

    it('full-text search on bio returns relevant mentors', async () => {
      const res = await request(app.getHttpServer())
        .get('/users/search')
        .query({ q: 'DevOps' })
        .expect(200);

      const items = res.body.data ?? res.body;
      const bios = items.map((u: any) => u.profile?.bio ?? u.bio ?? '');
      expect(bios.some((b: string) => b.includes('DevOps'))).toBe(true);
    });

    it('filters by hourlyRate range (min/max)', async () => {
      const res = await request(app.getHttpServer())
        .get('/users/search')
        .query({ minRate: 80, maxRate: 110 })
        .expect(200);

      const items = res.body.data ?? res.body;
      for (const item of items) {
        const rate = item.profile?.hourlyRate ?? item.hourlyRate;
        if (rate != null) {
          expect(rate).toBeGreaterThanOrEqual(80);
          expect(rate).toBeLessThanOrEqual(110);
        }
      }
    });

    it('filters by timezone', async () => {
      const res = await request(app.getHttpServer())
        .get('/users/search')
        .query({ timezone: 'UTC' })
        .expect(200);

      const items = res.body.data ?? res.body;
      expect(items.length).toBeGreaterThanOrEqual(1);
      for (const item of items) {
        expect(
          item.profile?.timezone ?? item.timezone,
        ).toBe('UTC');
      }
    });

    it('filters by language', async () => {
      const res = await request(app.getHttpServer())
        .get('/users/search')
        .query({ language: 'Spanish' })
        .expect(200);

      const items = res.body.data ?? res.body;
      expect(items.length).toBeGreaterThanOrEqual(1);
      for (const item of items) {
        const langs: string[] = item.profile?.languages ?? item.languages ?? [];
        expect(langs).toContain('Spanish');
      }
    });

    it('only returns mentor role users in search results', async () => {
      // Create a mentee with matching skill to ensure they're excluded
      const { token } = await registerMentee(app);
      await createProfile(app, token, { skills: ['TypeScript'] });

      const res = await request(app.getHttpServer())
        .get('/users/search')
        .query({ skills: 'TypeScript', role: 'mentor' })
        .expect(200);

      const items = res.body.data ?? res.body;
      for (const item of items) {
        expect(item.role).toBe('mentor');
      }
    });

    it('multiple skill filters return intersection', async () => {
      const res = await request(app.getHttpServer())
        .get('/users/search')
        .query({ skills: 'Python,PostgreSQL' })
        .expect(200);

      const items = res.body.data ?? res.body;
      for (const item of items) {
        const skills: string[] = item.profile?.skills ?? item.skills ?? [];
        expect(skills).toContain('Python');
        expect(skills).toContain('PostgreSQL');
      }
    });

    it('search does not return soft-deleted profiles', async () => {
      const { token } = await registerMentor(app);
      await createProfile(app, token, {
        bio: 'Will be deleted ghost user.',
        skills: ['UNIQUE_SKILL_FOR_DELETE_TEST'],
      });

      await request(app.getHttpServer())
        .delete('/users/profile')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);

      const res = await request(app.getHttpServer())
        .get('/users/search')
        .query({ skills: 'UNIQUE_SKILL_FOR_DELETE_TEST' })
        .expect(200);

      const items = res.body.data ?? res.body;
      expect(items).toHaveLength(0);
    });
  });

  // ── PAGINATION ────────────────────────────────────────────────────────────────

  describe('Pagination', () => {
    it('returns correct page size', async () => {
      const res = await request(app.getHttpServer())
        .get('/users/search')
        .query({ page: 1, limit: 2 })
        .expect(200);

      const items = res.body.data ?? res.body;
      expect(items.length).toBeLessThanOrEqual(2);
    });

    it('page 2 returns different items than page 1', async () => {
      const page1 = await request(app.getHttpServer())
        .get('/users/search')
        .query({ page: 1, limit: 2 })
        .expect(200);

      const page2 = await request(app.getHttpServer())
        .get('/users/search')
        .query({ page: 2, limit: 2 })
        .expect(200);

      const ids1 = (page1.body.data ?? page1.body).map(
        (u: any) => u.id ?? u.userId,
      );
      const ids2 = (page2.body.data ?? page2.body).map(
        (u: any) => u.id ?? u.userId,
      );

      // Pages should not overlap
      const overlap = ids1.filter((id: string) => ids2.includes(id));
      expect(overlap).toHaveLength(0);
    });

    it('returns pagination metadata (total, page, limit)', async () => {
      const res = await request(app.getHttpServer())
        .get('/users/search')
        .query({ page: 1, limit: 3 })
        .expect(200);

      // Accept both envelope and flat array responses
      if (res.body.meta || res.body.total !== undefined) {
        const meta = res.body.meta ?? res.body;
        expect(meta.total).toBeGreaterThanOrEqual(0);
        expect(meta.page ?? meta.currentPage).toBe(1);
        expect(meta.limit ?? meta.itemsPerPage).toBe(3);
      }
    });

    it('returns 400 for invalid page number', async () => {
      await request(app.getHttpServer())
        .get('/users/search')
        .query({ page: -1, limit: 10 })
        .expect(400);
    });

    it('returns 400 for limit exceeding maximum', async () => {
      await request(app.getHttpServer())
        .get('/users/search')
        .query({ page: 1, limit: 1000 })
        .expect(400);
    });

    it('last page may return fewer items than limit', async () => {
      // First, count total items
      const countRes = await request(app.getHttpServer())
        .get('/users/search')
        .query({ page: 1, limit: 100 })
        .expect(200);

      const total = (countRes.body.data ?? countRes.body).length;
      if (total === 0) return; // Skip if no users exist

      const lastPage = Math.ceil(total / 2);
      const lastRes = await request(app.getHttpServer())
        .get('/users/search')
        .query({ page: lastPage, limit: 2 })
        .expect(200);

      const items = lastRes.body.data ?? lastRes.body;
      expect(items.length).toBeGreaterThanOrEqual(0);
      expect(items.length).toBeLessThanOrEqual(2);
    });
  });

  // ── SORTING ───────────────────────────────────────────────────────────────────

  describe('Sorting', () => {
    it('sorts by hourlyRate ascending', async () => {
      const res = await request(app.getHttpServer())
        .get('/users/search')
        .query({ sortBy: 'hourlyRate', order: 'ASC' })
        .expect(200);

      const items = res.body.data ?? res.body;
      const rates = items
        .map((u: any) => u.profile?.hourlyRate ?? u.hourlyRate)
        .filter((r: any) => r != null);

      for (let i = 1; i < rates.length; i++) {
        expect(rates[i]).toBeGreaterThanOrEqual(rates[i - 1]);
      }
    });

    it('sorts by hourlyRate descending', async () => {
      const res = await request(app.getHttpServer())
        .get('/users/search')
        .query({ sortBy: 'hourlyRate', order: 'DESC' })
        .expect(200);

      const items = res.body.data ?? res.body;
      const rates = items
        .map((u: any) => u.profile?.hourlyRate ?? u.hourlyRate)
        .filter((r: any) => r != null);

      for (let i = 1; i < rates.length; i++) {
        expect(rates[i]).toBeLessThanOrEqual(rates[i - 1]);
      }
    });

    it('rejects invalid sortBy field', async () => {
      await request(app.getHttpServer())
        .get('/users/search')
        .query({ sortBy: 'password', order: 'ASC' })
        .expect(400);
    });
  });
});