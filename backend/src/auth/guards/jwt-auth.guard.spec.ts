import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from './jwt-auth.guard';
import { UserStatus } from '../../users/enums/user-status.enum';
import { SuspensionService } from '../suspension.service';
import { RedisService } from '../../redis/redis.service';
import { createHmac } from 'crypto';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  const secret = 'test-secret';

  const suspensionService = {
    getActiveSuspension: jest.fn().mockResolvedValue(null),
  };

  const redisService = {
    get: jest.fn().mockResolvedValue(null),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        JwtAuthGuard,
        {
          provide: ConfigService,
          useValue: {
            get: jest.fn().mockReturnValue(secret),
          },
        },
        { provide: SuspensionService, useValue: suspensionService },
        { provide: RedisService, useValue: redisService },
      ],
    }).compile();

    guard = module.get<JwtAuthGuard>(JwtAuthGuard);
    jest.clearAllMocks();
    suspensionService.getActiveSuspension.mockResolvedValue(null);
    redisService.get.mockResolvedValue(null);
  });

  const createToken = (payload: Record<string, unknown>) => {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHmac('sha256', secret)
      .update(`${header}.${encodedPayload}`)
      .digest('base64url');
    return `${header}.${encodedPayload}.${signature}`;
  };

  const createMockContext = (token?: string): ExecutionContext =>
    ({
      switchToHttp: () => ({
        getRequest: () => ({
          headers: {
            authorization: token ? `Bearer ${token}` : undefined,
          },
        }),
      }),
    }) as ExecutionContext;

  it('should allow active users', async () => {
    const token = createToken({
      sub: '1',
      status: UserStatus.ACTIVE,
      typ: 'access',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    await expect(guard.canActivate(createMockContext(token))).resolves.toBe(true);
  });

  it('should reject non-active users', async () => {
    const token = createToken({
      sub: '1',
      status: UserStatus.SUSPENDED,
      typ: 'access',
      exp: Math.floor(Date.now() / 1000) + 3600,
    });

    await expect(guard.canActivate(createMockContext(token))).rejects.toThrow(ForbiddenException);
  });

  it('should throw UnauthorizedException if token is missing', async () => {
    await expect(guard.canActivate(createMockContext())).rejects.toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException if token is invalid', async () => {
    await expect(guard.canActivate(createMockContext('invalid-token'))).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
