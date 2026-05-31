import { ExecutionContext, ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { JwtAuthGuard } from './jwt-auth.guard';
import { UserStatus } from '../../users/enums/user-status.enum';
import { createHmac } from 'crypto';

describe('JwtAuthGuard', () => {
  let guard: JwtAuthGuard;
  let configService: ConfigService;
  const secret = 'test-secret';

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
      ],
    }).compile();

    guard = module.get<JwtAuthGuard>(JwtAuthGuard);
    configService = module.get<ConfigService>(ConfigService);
  });

  const createToken = (payload: any) => {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url');
    const encodedPayload = Buffer.from(JSON.stringify(payload)).toString('base64url');
    const signature = createHmac('sha256', secret)
      .update(`${header}.${encodedPayload}`)
      .digest('base64url');
    return `${header}.${encodedPayload}.${signature}`;
  };

  const createMockContext = (token?: string): ExecutionContext => {
    return {
      switchToHttp: () => ({
        getRequest: () => ({
          headers: {
            authorization: token ? `Bearer ${token}` : undefined,
          },
        }),
      }),
    } as any;
  };

  it('should allow active users', () => {
    const payload = {
      sub: '1',
      status: UserStatus.ACTIVE,
      typ: 'access',
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const token = createToken(payload);
    const context = createMockContext(token);

    expect(guard.canActivate(context)).toBe(true);
  });

  it('should reject non-active users', () => {
    const payload = {
      sub: '1',
      status: UserStatus.SUSPENDED,
      typ: 'access',
      exp: Math.floor(Date.now() / 1000) + 3600,
    };
    const token = createToken(payload);
    const context = createMockContext(token);

    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('should throw UnauthorizedException if token is missing', () => {
    const context = createMockContext();
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });

  it('should throw UnauthorizedException if token is invalid', () => {
    const context = createMockContext('invalid-token');
    expect(() => guard.canActivate(context)).toThrow(UnauthorizedException);
  });
});
