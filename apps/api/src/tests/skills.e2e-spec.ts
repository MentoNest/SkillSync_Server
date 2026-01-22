import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import request from 'supertest';
import { AppModule } from '../app.module';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Skill } from '../entities/skill.entity';
import { MentorSkill, SkillLevel } from '../entities/mentor-skill.entity';
import { MentorProfile } from '../entities/mentor-profile.entity';

describe('Skills and Mentor Skills E2E', () => {
  let app: INestApplication;
  let skillRepository: any;
  let mentorSkillRepository: any;
  let mentorProfileRepository: any;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();

    skillRepository = moduleFixture.get(getRepositoryToken(Skill));
    mentorSkillRepository = moduleFixture.get(getRepositoryToken(MentorSkill));
    mentorProfileRepository = moduleFixture.get(getRepositoryToken(MentorProfile));
  });

  afterAll(async () => {
    await app.close();
  });

  describe('/skills (POST)', () => {
    it('should create a new skill', () => {
      return request(app.getHttpServer())
        .post('/skills')
        .send({ name: 'TypeScript', category: 'programming-language' })
        .expect(201)
        .expect((res: request.Response) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body.name).toBe('TypeScript');
          expect(res.body.slug).toBe('typescript');
        });
    });

    it('should return 409 if skill already exists', async () => {
      await request(app.getHttpServer())
        .post('/skills')
        .send({ name: 'JavaScript', category: 'programming-language' })
        .expect(201);

      return request(app.getHttpServer())
        .post('/skills')
        .send({ name: 'JavaScript', category: 'programming-language' })
        .expect(409);
    });
  });

  describe('/skills (GET)', () => {
    it('should return all skills', () => {
      return request(app.getHttpServer())
        .get('/skills')
        .expect(200)
        .expect((res: request.Response) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });
  });

  describe('/skills/:id (GET)', () => {
    it('should return a skill by id', async () => {
      const skill = await skillRepository.save({
        name: 'React',
        slug: 'react',
        category: 'frontend',
      });

      return request(app.getHttpServer())
        .get(`/skills/${skill.id}`)
        .expect(200)
        .expect((res: request.Response) => {
          expect(res.body.name).toBe('React');
        });
    });

    it('should return 404 if skill not found', () => {
      return request(app.getHttpServer())
        .get('/skills/00000000-0000-0000-0000-000000000000')
        .expect(404);
    });
  });

  describe('/mentor-skills/attach (POST)', () => {
    it('should attach a skill to mentor profile', async () => {
      const skill = await skillRepository.save({
        name: 'Node.js',
        slug: 'nodejs',
        category: 'backend',
      });

      return request(app.getHttpServer())
        .post('/mentor-skills/attach')
        .send({
          skillId: skill.id,
          level: SkillLevel.INTERMEDIATE,
          yearsExperience: 3,
        })
        .expect(201)
        .expect((res: request.Response) => {
          expect(res.body).toHaveProperty('id');
          expect(res.body.level).toBe(SkillLevel.INTERMEDIATE);
        });
    });

    it('should return 404 if skill not found', () => {
      return request(app.getHttpServer())
        .post('/mentor-skills/attach')
        .send({
          skillId: '00000000-0000-0000-0000-000000000000',
          level: SkillLevel.INTERMEDIATE,
          yearsExperience: 3,
        })
        .expect(404);
    });
  });

  describe('/mentors (GET)', () => {
    it('should filter mentors by skills', async () => {
      const skill1 = await skillRepository.save({
        name: 'Python',
        slug: 'python',
        category: 'programming-language',
      });

      return request(app.getHttpServer())
        .get(`/mentors?skills=${skill1.id}`)
        .expect(200)
        .expect((res: request.Response) => {
          expect(Array.isArray(res.body)).toBe(true);
        });
    });

    it('should return empty array if no skills parameter', () => {
      return request(app.getHttpServer())
        .get('/mentors')
        .expect(200)
        .expect((res: request.Response) => {
          expect(res.body).toEqual([]);
        });
    });
  });
});
