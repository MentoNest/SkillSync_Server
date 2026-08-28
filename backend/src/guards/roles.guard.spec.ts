import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import { RolesGuard } from './roles.guard';
import { UserStatus } from '../entities/user.entity';

describe('RolesGuard (#1176 status-based access control)', () => {
  let guard: RolesGuard;
  let mockReflector: any;
  let mockJwtService: any;
  let mockUserRepository: any;
  let mockRoleRepository: any;

  const buildContext = (headers: Record<string, string> = {}) => {
    const request: any = { headers };
    return {
      switchToHttp: () => ({ getRequest: () => request }),
      getHandler: () => ({}),
      getClass: () => ({}),
    } as any;
  };

  beforeEach(() => {
    mockReflector = { getAllAndOverride: jest.fn().mockReturnValue(undefined) };
    mockJwtService = { verify: jest.fn() };
    mockUserRepository = { findOne: jest.fn(), save: jest.fn().mockImplementation((u) => Promise.resolve(u)) };
    mockRoleRepository = { findOne: jest.fn() };

    guard = new RolesGuard(mockReflector, mockJwtService, mockUserRepository, mockRoleRepository);
  });

  it('allows a request with no token and no required roles', async () => {
    const ctx = buildContext({});
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('allows an active user through', async () => {
    mockJwtService.verify.mockReturnValue({ sub: 'user-1', tokenVersion: 0 });
    mockUserRepository.findOne.mockResolvedValue({
      id: 'user-1',
      isLocked: false,
      tokenVersion: 0,
      status: UserStatus.ACTIVE,
      roles: [],
    });

    const ctx = buildContext({ authorization: 'Bearer token' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it.each([UserStatus.SUSPENDED, UserStatus.DELETED, UserStatus.PENDING_VERIFICATION])(
    'rejects a %s user with 403',
    async (status) => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-1', tokenVersion: 0 });
      mockUserRepository.findOne.mockResolvedValue({
        id: 'user-1',
        isLocked: false,
        tokenVersion: 0,
        status,
        roles: [],
      });

      const ctx = buildContext({ authorization: 'Bearer token' });
      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    },
  );

  it('allows a non-active user through when @AllowInactiveStatus() is set', async () => {
    mockReflector.getAllAndOverride.mockImplementation((key: string) =>
      key === 'allowInactiveStatus' ? true : undefined,
    );
    mockJwtService.verify.mockReturnValue({ sub: 'user-1', tokenVersion: 0 });
    mockUserRepository.findOne.mockResolvedValue({
      id: 'user-1',
      isLocked: false,
      tokenVersion: 0,
      status: UserStatus.DELETED,
      roles: [],
    });

    const ctx = buildContext({ authorization: 'Bearer token' });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });
});
