import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import { vi } from 'vitest';
import { UserService } from '../src/user/user.service.js';
import { UserStatus } from '../src/user/entities/user.entity.js';
import { ProfileLookupController } from '../src/user/profile-lookup.controller.js';

describe('Public profile lookup (e2e)', () => {
  let app: INestApplication;

  const userService = {
    findByIdIfActive: vi.fn(),
    findByUsername: vi.fn(),
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      controllers: [ProfileLookupController],
      providers: [{ provide: UserService, useValue: userService }],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterAll(async () => {
    await app.close();
  });

  it('returns a public profile by username without exposing private fields', async () => {
    userService.findByUsername.mockResolvedValue({
      id: 'user-1',
      username: 'alex_rivers',
      displayName: 'Alex Rivers',
      email: 'alex@example.com',
      walletAddress: 'private-wallet',
      status: UserStatus.ACTIVE,
      roles: [{ name: 'mentor' }],
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    const response = await request(app.getHttpServer())
      .get('/profiles/alex_rivers')
      .expect(200);

    expect(userService.findByUsername).toHaveBeenCalledWith('alex_rivers');
    expect(response.body).toMatchObject({
      id: 'user-1',
      username: 'alex_rivers',
      displayName: 'Alex Rivers',
      roles: ['mentor'],
    });
    expect(response.body).not.toHaveProperty('email');
    expect(response.body).not.toHaveProperty('walletAddress');
  });

  it('looks up UUID paths by ID', async () => {
    const userId = '123e4567-e89b-12d3-a456-426614174000';
    userService.findByIdIfActive.mockResolvedValue({
      id: userId,
      displayName: 'Alex Rivers',
      status: UserStatus.ACTIVE,
      roles: [],
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
    });

    await request(app.getHttpServer()).get(`/profiles/${userId}`).expect(200);
    expect(userService.findByIdIfActive).toHaveBeenCalledWith(userId);
    expect(userService.findByUsername).not.toHaveBeenCalled();
  });

  it('returns 404 for missing profiles', async () => {
    userService.findByUsername.mockResolvedValue(null);

    await request(app.getHttpServer()).get('/profiles/missing').expect(404);
  });

  it('hides non-active profiles with 404', async () => {
    userService.findByUsername.mockResolvedValue({
      id: 'user-2',
      username: 'suspended',
      status: UserStatus.SUSPENDED,
      roles: [],
    });

    await request(app.getHttpServer()).get('/profiles/suspended').expect(404);
  });
});
