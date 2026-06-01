import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { AuthRole } from './../src/auth/enums/auth-role.enum';

describe('User Profile Creation (e2e)', () => {
  let app: INestApplication<App>;
  let accessToken: string;
  let userId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ transform: true, whitelist: true }));
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  describe('POST /users/profile', () => {
    it('should require authentication', async () => {
      return request(app.getHttpServer())
        .post('/users/profile')
        .send({
          profileType: AuthRole.MENTOR,
          bio: 'Experienced mentor',
          expertise: ['frontend'],
          yearsOfExperience: 5,
        })
        .expect(401);
    });

    it('should validate required mentor profile fields', async () => {
      return request(app.getHttpServer())
        .post('/users/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          profileType: AuthRole.MENTOR,
          // Missing required fields: bio, expertise, yearsOfExperience
        })
        .expect(400);
    });

    it('should validate required mentee profile fields', async () => {
      return request(app.getHttpServer())
        .post('/users/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          profileType: AuthRole.MENTEE,
          // Missing required fields: learningGoals, currentSkillLevel, timeCommitmentHoursPerWeek
        })
        .expect(400);
    });

    it('should validate expertise array has unique values', async () => {
      return request(app.getHttpServer())
        .post('/users/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          profileType: AuthRole.MENTOR,
          bio: 'Experienced mentor',
          expertise: ['frontend', 'frontend'], // Duplicate
          yearsOfExperience: 5,
        })
        .expect(400);
    });

    it('should return 409 when mentor profile already exists', async () => {
      // Assuming a profile was already created
      return request(app.getHttpServer())
        .post('/users/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          profileType: AuthRole.MENTOR,
          bio: 'Another mentor',
          expertise: ['backend'],
          yearsOfExperience: 3,
        })
        .expect(409); // Conflict
    });

    it('should create a mentor profile with 201 status', async () => {
      const response = await request(app.getHttpServer())
        .post('/users/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          profileType: AuthRole.MENTOR,
          bio: 'Experienced frontend mentor',
          expertise: ['react', 'typescript'],
          yearsOfExperience: 5,
          preferredMentoringStyle: ['pair-programming'],
          availabilityHoursPerWeek: 10,
          availabilityDetails: 'Weekends preferred',
        })
        .expect(201);

      expect(response.body).toMatchObject({
        bio: 'Experienced frontend mentor',
        expertise: ['react', 'typescript'],
        yearsOfExperience: 5,
      });
      expect(response.body.id).toBeDefined();
      expect(response.body.createdAt).toBeDefined();
      expect(response.body.updatedAt).toBeDefined();
    });

    it('should create a mentee profile with 201 status', async () => {
      const response = await request(app.getHttpServer())
        .post('/users/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          profileType: AuthRole.MENTEE,
          learningGoals: 'Learn full-stack development',
          areasOfInterest: ['web-development', 'databases'],
          currentSkillLevel: 'intermediate',
          timeCommitmentHoursPerWeek: 5,
          professionalBackground: 'Recent bootcamp graduate',
          jobTitle: 'Junior Developer',
          industry: 'Software Development',
          portfolioLinks: ['https://github.com/user'],
        })
        .expect(201);

      expect(response.body).toMatchObject({
        learningGoals: 'Learn full-stack development',
        currentSkillLevel: 'intermediate',
      });
      expect(response.body.id).toBeDefined();
      expect(response.body.createdAt).toBeDefined();
      expect(response.body.updatedAt).toBeDefined();
    });

    it('should allow user to have both mentor and mentee profiles', async () => {
      // Create a mentee profile first
      await request(app.getHttpServer())
        .post('/users/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          profileType: AuthRole.MENTEE,
          learningGoals: 'Goals',
          currentSkillLevel: 'beginner',
          timeCommitmentHoursPerWeek: 2,
        })
        .expect(201);

      // Then create a mentor profile
      const mentorResponse = await request(app.getHttpServer())
        .post('/users/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          profileType: AuthRole.MENTOR,
          bio: 'Also a mentor',
          expertise: ['testing'],
          yearsOfExperience: 2,
        })
        .expect(201);

      expect(mentorResponse.body).toBeDefined();
    });

    it('should assign mentor role to user when mentor profile created', async () => {
      const meResponse = await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const roles = meResponse.body.roles.map((r: any) => r.name);
      expect(roles).toContain(AuthRole.MENTOR);
    });

    it('should assign mentee role to user when mentee profile created', async () => {
      const meResponse = await request(app.getHttpServer())
        .get('/users/me')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      const roles = meResponse.body.roles.map((r: any) => r.name);
      expect(roles).toContain(AuthRole.MENTEE);
    });

    it('should validate yearsOfExperience is non-negative', async () => {
      return request(app.getHttpServer())
        .post('/users/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          profileType: AuthRole.MENTOR,
          bio: 'Mentor',
          expertise: ['skills'],
          yearsOfExperience: -1, // Invalid
        })
        .expect(400);
    });

    it('should validate expertise array max size', async () => {
      const expertise = Array(21).fill('skill');
      return request(app.getHttpServer())
        .post('/users/profile')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          profileType: AuthRole.MENTOR,
          bio: 'Mentor',
          expertise, // Exceeds max size of 20
          yearsOfExperience: 5,
        })
        .expect(400);
    });
  });
});
