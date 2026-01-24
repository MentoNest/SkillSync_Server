import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ProfileModule } from './profile.module';
import { User } from '../users/entities/user.entity';
import { JwtService } from '@nestjs/jwt';
import { UsersModule } from '../users/users.module';
import { AuthModule } from '../auth/auth.module';

describe('ProfileController (e2e)', () => {
  let app: INestApplication;
  let userRepository: Repository<User>;
  let jwtService: JwtService;
  let testUser: User;
  let authToken: string;

  const mockUserRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
    update: jest.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [ProfileModule, UsersModule, AuthModule],
    })
      .overrideProvider(getRepositoryToken(User))
      .useValue(mockUserRepository)
      .compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
      }),
    );

    await app.init();

    userRepository = moduleFixture.get<Repository<User>>(
      getRepositoryToken(User),
    );
    jwtService = moduleFixture.get<JwtService>(JwtService);

    // Create test user
    testUser = {
      id: '123e4567-e89b-12d3-a456-426614174000',
      email: 'test@example.com',
      password: 'hashedpassword',
      name: 'Test User',
      bio: 'Test bio',
      avatarUrl: 'https://example.com/avatar.jpg',
      timezone: 'UTC',
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Generate auth token
    authToken = jwtService.sign({
      sub: testUser.id,
      email: testUser.email,
    });

    mockUserRepository.findOne.mockResolvedValue(testUser);
  });

  afterAll(async () => {
    await app.close();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('GET /me', () => {
    it('should return current user profile with valid token', () => {
      return request(app.getHttpServer())
        .get('/me')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('id', testUser.id);
          expect(res.body).toHaveProperty('email', testUser.email);
          expect(res.body).toHaveProperty('name', testUser.name);
          expect(res.body).toHaveProperty('bio', testUser.bio);
          expect(res.body).toHaveProperty('avatarUrl', testUser.avatarUrl);
          expect(res.body).toHaveProperty('timezone', testUser.timezone);
          expect(res.body).toHaveProperty('createdAt');
          expect(res.body).toHaveProperty('updatedAt');
          expect(res.body).not.toHaveProperty('password');
        });
    });

    it('should return 401 without auth token', () => {
      return request(app.getHttpServer()).get('/me').expect(401);
    });

    it('should return 401 with invalid token', () => {
      return request(app.getHttpServer())
        .get('/me')
        .set('Authorization', 'Bearer invalid-token')
        .expect(401);
    });
  });

  describe('PATCH /me', () => {
    it('should update profile name successfully', () => {
      const updateDto = { name: 'Updated Name' };
      const updatedUser = { ...testUser, ...updateDto };

      mockUserRepository.update.mockResolvedValue({ affected: 1 });
      mockUserRepository.findOne.mockResolvedValueOnce(updatedUser);

      return request(app.getHttpServer())
        .patch('/me')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateDto)
        .expect(200)
        .expect((res) => {
          expect(res.body.name).toBe('Updated Name');
        });
    });

    it('should update profile bio successfully', () => {
      const updateDto = { bio: 'Updated bio content' };
      const updatedUser = { ...testUser, ...updateDto };

      mockUserRepository.update.mockResolvedValue({ affected: 1 });
      mockUserRepository.findOne.mockResolvedValueOnce(updatedUser);

      return request(app.getHttpServer())
        .patch('/me')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateDto)
        .expect(200)
        .expect((res) => {
          expect(res.body.bio).toBe('Updated bio content');
        });
    });

    it('should update avatarUrl successfully', () => {
      const updateDto = { avatarUrl: 'https://newavatar.com/image.png' };
      const updatedUser = { ...testUser, ...updateDto };

      mockUserRepository.update.mockResolvedValue({ affected: 1 });
      mockUserRepository.findOne.mockResolvedValueOnce(updatedUser);

      return request(app.getHttpServer())
        .patch('/me')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateDto)
        .expect(200)
        .expect((res) => {
          expect(res.body.avatarUrl).toBe('https://newavatar.com/image.png');
        });
    });

    it('should update timezone successfully', () => {
      const updateDto = { timezone: 'America/New_York' };
      const updatedUser = { ...testUser, ...updateDto };

      mockUserRepository.update.mockResolvedValue({ affected: 1 });
      mockUserRepository.findOne.mockResolvedValueOnce(updatedUser);

      return request(app.getHttpServer())
        .patch('/me')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateDto)
        .expect(200)
        .expect((res) => {
          expect(res.body.timezone).toBe('America/New_York');
        });
    });

    it('should update multiple fields at once', () => {
      const updateDto = {
        name: 'Multi Update',
        bio: 'Multi bio',
        avatarUrl: 'https://multi.com/avatar.jpg',
        timezone: 'Europe/London',
      };
      const updatedUser = { ...testUser, ...updateDto };

      mockUserRepository.update.mockResolvedValue({ affected: 1 });
      mockUserRepository.findOne.mockResolvedValueOnce(updatedUser);

      return request(app.getHttpServer())
        .patch('/me')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateDto)
        .expect(200)
        .expect((res) => {
          expect(res.body.name).toBe(updateDto.name);
          expect(res.body.bio).toBe(updateDto.bio);
          expect(res.body.avatarUrl).toBe(updateDto.avatarUrl);
          expect(res.body.timezone).toBe(updateDto.timezone);
        });
    });

    it('should reject name longer than 100 characters', () => {
      const updateDto = { name: 'a'.repeat(101) };

      return request(app.getHttpServer())
        .patch('/me')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateDto)
        .expect(400);
    });

    it('should reject bio longer than 500 characters', () => {
      const updateDto = { bio: 'a'.repeat(501) };

      return request(app.getHttpServer())
        .patch('/me')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateDto)
        .expect(400);
    });

    it('should reject invalid URL for avatarUrl', () => {
      const updateDto = { avatarUrl: 'not-a-valid-url' };

      return request(app.getHttpServer())
        .patch('/me')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateDto)
        .expect(400);
    });

    it('should reject invalid timezone', () => {
      const updateDto = { timezone: 'Invalid/Timezone' };

      return request(app.getHttpServer())
        .patch('/me')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateDto)
        .expect(400);
    });

    it('should return 401 without auth token', () => {
      return request(app.getHttpServer())
        .patch('/me')
        .send({ name: 'Test' })
        .expect(401);
    });

    it('should reject unknown fields', () => {
      const updateDto = { name: 'Test', unknownField: 'value' };

      return request(app.getHttpServer())
        .patch('/me')
        .set('Authorization', `Bearer ${authToken}`)
        .send(updateDto)
        .expect(400);
    });
  });
});