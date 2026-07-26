import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard.js';
import { AuthRole } from '../../common/enums/auth-role.enum.js';

describe('RolesGuard', () => {
  let guard: RolesGuard;
  let reflector: Reflector;

  const createContext = (roles?: string[]): ExecutionContext =>
    ({
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({
        getRequest: () => ({ user: roles ? { roles } : undefined }),
      }),
    }) as unknown as ExecutionContext;

  beforeEach(() => {
    reflector = new Reflector();
    guard = new RolesGuard(reflector);
  });

  it('should allow access when no roles are required', () => {
    jest.spyOn(reflector, 'getAllAndOverride').mockReturnValue(undefined);
    expect(guard.canActivate(createContext())).toBe(true);
  });

  it('should allow access when user has a required role', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([AuthRole.ADMIN]);
    expect(guard.canActivate(createContext([AuthRole.ADMIN]))).toBe(true);
  });

  it('should throw ForbiddenException with a clear message when user lacks the role', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([AuthRole.ADMIN]);
    expect(() => guard.canActivate(createContext([AuthRole.MENTEE]))).toThrow(
      ForbiddenException,
    );
    expect(() => guard.canActivate(createContext([AuthRole.MENTEE]))).toThrow(
      /Requires one of the following roles: admin/,
    );
  });

  it('should throw ForbiddenException when there is no authenticated user', () => {
    jest
      .spyOn(reflector, 'getAllAndOverride')
      .mockReturnValue([AuthRole.ADMIN]);
    expect(() => guard.canActivate(createContext())).toThrow(
      ForbiddenException,
    );
  });
});
