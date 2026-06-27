import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, HttpStatus } from '@nestjs/common';
import * as request from 'supertest';
import { DataSource } from 'typeorm';
import { AppModule } from '../src/app.module';

describe('User Profile Subsystem (E2E)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  
  // High-privilege setup tokens for role-based testing matrices
  let mentorToken: string;
  let menteeToken: string;
  let adminToken: string;
  
  let targetProfileId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);

    // Seed localized operational test-session keys 
    mentorToken = 'MOCK_JWT_MENTOR_TOKEN';
    menteeToken = 'MOCK_JWT_MENTEE_TOKEN';
    adminToken = 'MOCK_JWT_SUPER_ADMIN_TOKEN';
  });

  afterAll(async () => {
    await dataSource.destroy();
    await app.close();
  });

  beforeEach(async () => {
    // Truncate profile tables to guarantee query evaluation purity across assertions
    await dataSource.query(`TRUNCATE "user_profiles" CASCADE;`);
    await dataSource.query(`TRUNCATE "users" CASCADE;`);
  });

  describe('POST /v2/profiles (Creation & Validation Rules)', () => {
    it('should allow a registered user to instantiate a valid profile map', async () => {
      const response = await request(app.getHttpServer())
        .post('/v2/profiles')
        .set('Authorization', `Bearer ${mentorToken}`)
        .send({
          bio: 'Expert software developer specializing in backend architecture frameworks.',
          skills: ['TypeScript', 'Nest.js', 'PostgreSQL'],
          isMentor: true,
          hourlyRate: 75.00,
        })
        .expect(HttpStatus.CREATED);

      expect(response.body).toHaveProperty('id');
      expect(response.body.profileCompleteness).toBeGreaterThan(50);
      targetProfileId = response.body.id;
    });

    it('should throw a 400 Bad Request when mandatory verification parameters are missing', async () => {
      await request(app.getHttpServer())
        .post('/v2/profiles')
        .set('Authorization', `Bearer ${menteeToken}`)
        .send({
          bio: '', // Empty text field violation
        })
        .expect(HttpStatus.BAD_REQUEST);
    });
  });

  describe('GET /v2/profiles/public/:id (Public & Unauthenticated Isolation Rules)', () => {
    it('should expose public profiles to anonymous web visitors without a token', async () => {
      // Setup a baseline record via SQL directly to eliminate execution sequence dependencies
      const [profile] = await dataSource.query(`
        INSERT INTO "user_profiles" ("bio", "skills", "isMentor", "isFeatured", "profileCompleteness")
        VALUES ('Public Bio Data', '["Rust"]', true, true, 100) RETURNING "id";
      `);

      const response = await request(app.getHttpServer())
        .get(`/v2/profiles/public/${profile.id}`)
        .expect(HttpStatus.OK);

      expect(response.body.bio).toBe('Public Bio Data');
    });
  });

  describe('POST /v2/profiles/avatar (File Upload Handling with Mock Assets)', () => {
    it('should process multi-part stream buffers safely and save file attachment meta paths', async () => {
      const mockBuffer = Buffer.from('fake-image-binary-stream-data');

      const response = await request(app.getHttpServer())
        .post('/v2/profiles/avatar')
        .set('Authorization', `Bearer ${mentorToken}`)
        .attach('avatar', mockBuffer, 'test-avatar.png')
        .expect(HttpStatus.OK);

      expect(response.body).toHaveProperty('avatarUrl');
      expect(response.body.avatarUrl).toContain('test-avatar.png');
    });
  });

  describe('GET /v2/profiles (Paginated Queries & Search Filters)', () => {
    beforeEach(async () => {
      // Seed a dataset directly into the real database instance to check SQL order and behavior
      await dataSource.query(`
        INSERT INTO "user_profiles" ("bio", "skills", "isMentor", "isFeatured", "hourlyRate") VALUES
        ('Senior NestJS Dev', '["NestJS", "TypeScript"]', true, true, 90.00),
        ('Junior Rust Engineer', '["Rust"]', true, false, 40.00),
        ('Data Analyst Specialist', '["Python", "SQL"]', false, false, 0.00);
      `);
    });

    it('should return a list matching skill filter parameters and support standard pagination layouts', async () => {
      const response = await request(app.getHttpServer())
        .get('/v2/profiles?search=NestJS&limit=1&page=1')
        .expect(HttpStatus.OK);

      expect(response.body.data).toHaveLength(1);
      expect(response.body.meta.totalItems).toBe(1);
      expect(response.body.data[0].bio).toContain('Senior NestJS Dev');
    });

    it('should extract featured mentors through specialized collection routing targets', async () => {
      const response = await request(app.getHttpServer())
        .get('/v2/profiles/featured')
        .expect(HttpStatus.OK);

      expect(response.body.every((p: any) => p.isFeatured === true)).toBe(true);
    });
  });

  describe('DELETE /v2/profiles/:id (Soft-Delete & Administrative Restoration Hooks)', () => {
    let activeId: string;

    beforeEach(async () => {
      const [profile] = await dataSource.query(`
        INSERT INTO "user_profiles" ("bio", "skills", "isMentor")
        VALUES ('Deletable Profile', '[]', false) RETURNING "id";
      `);
      activeId = profile.id;
    });

    it('should flag profiles with a deletedAt timestamp on soft deletion rather than purging the record completely', async () => {
      await request(app.getHttpServer())
        .delete(`/v2/profiles/${activeId}`)
        .set('Authorization', `Bearer ${mentorToken}`)
        .expect(HttpStatus.NO_CONTENT);

      // Verify the record remains in the database but has a deletedAt timestamp set
      const rawCheck = await dataSource.query(`SELECT "deletedAt" FROM "user_profiles" WHERE "id" = $1`, [activeId]);
      expect(rawCheck[0].deletedAt).not.toBeNull();
    });

    it('should allow administrators to restore profiles that were previously soft deleted', async () => {
      // Simulate an existing soft-deleted state profile record
      await dataSource.query(`UPDATE "user_profiles" SET "deletedAt" = NOW() WHERE "id" = $1`, [activeId]);

      await request(app.getHttpServer())
        .post(`/v2/profiles/${activeId}/restore`)
        .set('Authorization', `Bearer ${adminToken}`)
        .expect(HttpStatus.OK);

      const rawCheck = await dataSource.query(`SELECT "deletedAt" FROM "user_profiles" WHERE "id" = $1`, [activeId]);
      expect(rawCheck[0].deletedAt).isNull();
    });
  });
});