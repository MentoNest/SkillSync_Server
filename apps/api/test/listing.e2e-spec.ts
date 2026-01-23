/* eslint-disable @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-call */
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import { DataSource } from 'typeorm';

describe('Listings E2E', () => {
  let app: INestApplication<App>;
  let dataSource: DataSource;
  let mentorProfileId1: string;
  let mentorProfileId2: string;
  let skillId1: string;
  let skillId2: string;
  let listingId1: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();

    dataSource = moduleFixture.get<DataSource>(DataSource);

    await dataSource.query(`DELETE FROM listing_skills`);
    await dataSource.query(`DELETE FROM listings`);
    await dataSource.query(`DELETE FROM mentor_profiles`);
    await dataSource.query(`DELETE FROM skills`);
    await dataSource.query(`DELETE FROM users`);

    const user1Result = await dataSource.query(
      `INSERT INTO users (id, email, "firstName", "lastName") 
       VALUES (uuid_generate_v4(), 'mentor1@test.com', 'John', 'Doe') 
       RETURNING id`,
    );
    const userId1 = user1Result[0].id;

    const user2Result = await dataSource.query(
      `INSERT INTO users (id, email, "firstName", "lastName") 
       VALUES (uuid_generate_v4(), 'mentor2@test.com', 'Jane', 'Smith') 
       RETURNING id`,
    );
    const userId2 = user2Result[0].id;

    const mentor1Result = await dataSource.query(
      `INSERT INTO mentor_profiles (id, user_id, bio, title) 
       VALUES (uuid_generate_v4(), $1, 'Experienced developer', 'Senior Developer') 
       RETURNING id`,
      [userId1],
    );
    mentorProfileId1 = mentor1Result[0].id;

    const mentor2Result = await dataSource.query(
      `INSERT INTO mentor_profiles (id, user_id, bio, title) 
       VALUES (uuid_generate_v4(), $1, 'Tech lead', 'Tech Lead') 
       RETURNING id`,
      [userId2],
    );
    mentorProfileId2 = mentor2Result[0].id;

    const skill1Result = await dataSource.query(
      `INSERT INTO skills (id, name, category) 
       VALUES (uuid_generate_v4(), 'JavaScript', 'Programming') 
       RETURNING id`,
    );
    skillId1 = skill1Result[0].id;

    const skill2Result = await dataSource.query(
      `INSERT INTO skills (id, name, category) 
       VALUES (uuid_generate_v4(), 'TypeScript', 'Programming') 
       RETURNING id`,
    );
    skillId2 = skill2Result[0].id;
  });

  afterAll(async () => {
    await dataSource.destroy();
    await app.close();
  });

  describe('POST /mentor/listings', () => {
    it('should create a new listing', async () => {
      const createDto = {
        title: 'JavaScript Mentorship',
        description: 'Learn JavaScript from scratch with hands-on projects.',
        hourlyRateMinorUnits: 500000,
        skillIds: [skillId1],
        active: true,
      };

      const response = await request(app.getHttpServer())
        .post('/mentor/listings')
        .set('x-mentor-profile-id', mentorProfileId1)
        .send(createDto)
        .expect(201);

      expect(response.body).toHaveProperty('id');
      expect(response.body.title).toBe(createDto.title);
      expect(response.body.hourlyRateMinorUnits).toBe(
        createDto.hourlyRateMinorUnits,
      );
      expect(response.body.skills).toHaveLength(1);
      expect(response.body.skills[0].id).toBe(skillId1);

      listingId1 = response.body.id;
    });

    it('should fail with invalid title length', async () => {
      const createDto = {
        title: 'JS',
        description: 'Learn JavaScript',
        hourlyRateMinorUnits: 500000,
        skillIds: [skillId1],
      };

      await request(app.getHttpServer())
        .post('/mentor/listings')
        .set('x-mentor-profile-id', mentorProfileId1)
        .send(createDto)
        .expect(400);
    });

    it('should fail with negative hourly rate', async () => {
      const createDto = {
        title: 'JavaScript Mentorship',
        description: 'Learn JavaScript',
        hourlyRateMinorUnits: -100,
        skillIds: [skillId1],
      };

      await request(app.getHttpServer())
        .post('/mentor/listings')
        .set('x-mentor-profile-id', mentorProfileId1)
        .send(createDto)
        .expect(400);
    });

    it('should fail with invalid skill IDs', async () => {
      const createDto = {
        title: 'JavaScript Mentorship',
        description: 'Learn JavaScript',
        hourlyRateMinorUnits: 500000,
        skillIds: ['00000000-0000-0000-0000-000000000000'],
      };

      await request(app.getHttpServer())
        .post('/mentor/listings')
        .set('x-mentor-profile-id', mentorProfileId1)
        .send(createDto)
        .expect(400);
    });

    it('should fail without mentor profile ID header', async () => {
      const createDto = {
        title: 'JavaScript Mentorship',
        description: 'Learn JavaScript',
        hourlyRateMinorUnits: 500000,
        skillIds: [skillId1],
      };

      await request(app.getHttpServer())
        .post('/mentor/listings')
        .send(createDto)
        .expect(401);
    });
  });

  describe('GET /mentor/listings', () => {
    it('should get all listings for current mentor', async () => {
      const response = await request(app.getHttpServer())
        .get('/mentor/listings')
        .set('x-mentor-profile-id', mentorProfileId1)
        .expect(200);

      expect(Array.isArray(response.body)).toBe(true);
      expect(response.body.length).toBeGreaterThan(0);
      expect(response.body[0]).toHaveProperty('id');
      expect(response.body[0]).toHaveProperty('title');
    });
  });

  describe('GET /mentor/listings/:id', () => {
    it('should get a specific listing', async () => {
      const response = await request(app.getHttpServer())
        .get(`/mentor/listings/${listingId1}`)
        .set('x-mentor-profile-id', mentorProfileId1)
        .expect(200);

      expect(response.body.id).toBe(listingId1);
      expect(response.body).toHaveProperty('title');
    });

    it('should fail to get another mentors listing', async () => {
      await request(app.getHttpServer())
        .get(`/mentor/listings/${listingId1}`)
        .set('x-mentor-profile-id', mentorProfileId2)
        .expect(403);
    });

    it('should return 404 for non-existent listing', async () => {
      await request(app.getHttpServer())
        .get('/mentor/listings/00000000-0000-0000-0000-000000000000')
        .set('x-mentor-profile-id', mentorProfileId1)
        .expect(404);
    });
  });

  describe('PATCH /mentor/listings/:id', () => {
    it('should update own listing', async () => {
      const updateDto = {
        title: 'Advanced JavaScript Mentorship',
        hourlyRateMinorUnits: 600000,
      };

      const response = await request(app.getHttpServer())
        .patch(`/mentor/listings/${listingId1}`)
        .set('x-mentor-profile-id', mentorProfileId1)
        .send(updateDto)
        .expect(200);

      expect(response.body.title).toBe(updateDto.title);
      expect(response.body.hourlyRateMinorUnits).toBe(
        updateDto.hourlyRateMinorUnits,
      );
    });

    it('should fail to update another mentors listing', async () => {
      const updateDto = { title: 'Hacked Title' };

      await request(app.getHttpServer())
        .patch(`/mentor/listings/${listingId1}`)
        .set('x-mentor-profile-id', mentorProfileId2)
        .send(updateDto)
        .expect(403);
    });
  });

  describe('GET /listings/search', () => {
    beforeAll(async () => {
      await request(app.getHttpServer())
        .post('/mentor/listings')
        .set('x-mentor-profile-id', mentorProfileId1)
        .send({
          title: 'TypeScript Advanced',
          description: 'Advanced TypeScript patterns and best practices.',
          hourlyRateMinorUnits: 800000,
          skillIds: [skillId2],
          active: true,
        });

      await request(app.getHttpServer())
        .post('/mentor/listings')
        .set('x-mentor-profile-id', mentorProfileId2)
        .send({
          title: 'Full Stack Development',
          description: 'Complete full stack development mentorship.',
          hourlyRateMinorUnits: 1000000,
          skillIds: [skillId1, skillId2],
          active: true,
        });
    });

    it('should return paginated listings', async () => {
      const response = await request(app.getHttpServer())
        .get('/listings/search')
        .query({ page: 1, limit: 10 })
        .expect(200);

      expect(response.body).toHaveProperty('items');
      expect(response.body).toHaveProperty('total');
      expect(response.body).toHaveProperty('page');
      expect(response.body).toHaveProperty('limit');
      expect(Array.isArray(response.body.items)).toBe(true);
    });

    it('should filter by skill IDs', async () => {
      const response = await request(app.getHttpServer())
        .get('/listings/search')
        .query({ skillIds: [skillId2] })
        .expect(200);

      expect(response.body.items.length).toBeGreaterThan(0);
      response.body.items.forEach((listing: any) => {
        const hasSkill = listing.skills.some(
          (skill: any) => skill.id === skillId2,
        );
        expect(hasSkill).toBe(true);
      });
    });

    it('should filter by rate range', async () => {
      const response = await request(app.getHttpServer())
        .get('/listings/search')
        .query({ minRate: 500000, maxRate: 800000 })
        .expect(200);

      response.body.items.forEach((listing: any) => {
        expect(listing.hourlyRateMinorUnits).toBeGreaterThanOrEqual(500000);
        expect(listing.hourlyRateMinorUnits).toBeLessThanOrEqual(800000);
      });
    });

    it('should filter by multiple skills (AND logic)', async () => {
      const response = await request(app.getHttpServer())
        .get('/listings/search')
        .query({ skillIds: [skillId1, skillId2] })
        .expect(200);

      response.body.items.forEach((listing: any) => {
        const hasAllSkills = [skillId1, skillId2].every((requiredId) =>
          listing.skills.some((skill: any) => skill.id === requiredId),
        );
        expect(hasAllSkills).toBe(true);
      });
    });

    it('should only return active listings by default', async () => {
      const response = await request(app.getHttpServer())
        .get('/listings/search')
        .expect(200);

      response.body.items.forEach((listing: any) => {
        expect(listing.active).toBe(true);
      });
    });

    it('should support pagination', async () => {
      const response1 = await request(app.getHttpServer())
        .get('/listings/search')
        .query({ page: 1, limit: 2 })
        .expect(200);

      expect(response1.body.page).toBe(1);
      expect(response1.body.limit).toBe(2);
      expect(response1.body.items.length).toBeLessThanOrEqual(2);
    });
  });

  describe('DELETE /mentor/listings/:id', () => {
    it('should delete own listing', async () => {
      await request(app.getHttpServer())
        .delete(`/mentor/listings/${listingId1}`)
        .set('x-mentor-profile-id', mentorProfileId1)
        .expect(204);

      await request(app.getHttpServer())
        .get(`/mentor/listings/${listingId1}`)
        .set('x-mentor-profile-id', mentorProfileId1)
        .expect(404);
    });

    it('should fail to delete another mentors listing', async () => {
      const newListingResponse = await request(app.getHttpServer())
        .post('/mentor/listings')
        .set('x-mentor-profile-id', mentorProfileId1)
        .send({
          title: 'Test Listing',
          description: 'Test description',
          hourlyRateMinorUnits: 500000,
          skillIds: [skillId1],
        });

      await request(app.getHttpServer())
        .delete(`/mentor/listings/${newListingResponse.body.id}`)
        .set('x-mentor-profile-id', mentorProfileId2)
        .expect(403);
    });
  });
});
