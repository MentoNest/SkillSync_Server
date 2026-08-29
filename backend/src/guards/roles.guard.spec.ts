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
  let mockSuspensionRepository: any;

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
    mockSuspensionRepository = {
      findOne: jest.fn().mockResolvedValue(null),
      save: jest.fn().mockImplementation((s) => Promise.resolve(s)),
    };

    guard = new RolesGuard(
      mockReflector,
      mockJwtService,
      mockUserRepository,
      mockRoleRepository,
      mockSuspensionRepository,
    );
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

  describe('#1175 suspension handling', () => {
    it('rejects a suspended user with reason and suspendedUntil in the error', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-1', tokenVersion: 0 });
      mockUserRepository.findOne.mockResolvedValue({
        id: 'user-1',
        isLocked: false,
        tokenVersion: 0,
        status: UserStatus.SUSPENDED,
        roles: [],
      });
      const suspendedUntil = new Date(Date.now() + 86400000);
      mockSuspensionRepository.findOne.mockResolvedValue({
        id: 'susp-1',
        userId: 'user-1',
        reason: 'spam',
        isActive: true,
        suspendedUntil,
      });

      const ctx = buildContext({ authorization: 'Bearer token' });
      try {
        await guard.canActivate(ctx);
        fail('expected ForbiddenException');
      } catch (err: any) {
        expect(err).toBeInstanceOf(ForbiddenException);
        const response = err.getResponse();
        expect(response.reason).toBe('spam');
        expect(response.suspendedUntil).toEqual(suspendedUntil);
      }
    });

    it('auto-expires a suspension whose suspendedUntil has passed and allows the request', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-1', tokenVersion: 0 });
      const user = {
        id: 'user-1',
        isLocked: false,
        tokenVersion: 0,
        status: UserStatus.SUSPENDED,
        roles: [],
      };
      mockUserRepository.findOne.mockResolvedValue(user);
      mockSuspensionRepository.findOne.mockResolvedValue({
        id: 'susp-1',
        userId: 'user-1',
        reason: 'spam',
        isActive: true,
        suspendedUntil: new Date(Date.now() - 1000), // already expired
      });

      const ctx = buildContext({ authorization: 'Bearer token' });
      await expect(guard.canActivate(ctx)).resolves.toBe(true);

      expect(mockSuspensionRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ isActive: false, liftReason: 'expired' }),
      );
      expect(mockUserRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({ status: UserStatus.ACTIVE }),
      );
    });

    it('rejects a permanently suspended user (no suspendedUntil)', async () => {
      mockJwtService.verify.mockReturnValue({ sub: 'user-1', tokenVersion: 0 });
      mockUserRepository.findOne.mockResolvedValue({
        id: 'user-1',
        isLocked: false,
        tokenVersion: 0,
        status: UserStatus.SUSPENDED,
        roles: [],
      });
      mockSuspensionRepository.findOne.mockResolvedValue({
        id: 'susp-1',
        userId: 'user-1',
        reason: 'severe abuse',
        isActive: true,
        suspendedUntil: null,
      });

      const ctx = buildContext({ authorization: 'Bearer token' });
      await expect(guard.canActivate(ctx)).rejects.toThrow(ForbiddenException);
    });
  });
});
