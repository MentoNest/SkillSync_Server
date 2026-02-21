import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RolesGuard } from './roles.guard';
import { UserRole } from '../enums/user-role.enum';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { IS_PUBLIC_KEY } from '../../modules/auth/decorators/public.decorator';

function createMockContext(overrides: {
  roles?: UserRole[];
  isPublic?: boolean;
  userRole?: UserRole | null;
}) {
  const handler = jest.fn();
  const classRef = jest.fn();

  const reflector = {
    getAllAndOverride: jest.fn((key: string) => {
      if (key === IS_PUBLIC_KEY) return overrides.isPublic ?? false;
      if (key === ROLES_KEY) return overrides.roles ?? undefined;
      return undefined;
    }),
  } as unknown as Reflector;

  const request = {
    user:
      overrides.userRole === null
        ? undefined
        : { sub: 'user-1', email: 'test@example.com', role: overrides.userRole ?? UserRole.MENTEE },
  };

  const context = {
    getHandler: () => handler,
    getClass: () => classRef,
    switchToHttp: () => ({ getRequest: () => request }),
  } as any;

  return { reflector, context };
}

describe('RolesGuard', () => {
  it('passes when no @Roles() decorator is set', () => {
    const { reflector, context } = createMockContext({});
    const guard = new RolesGuard(reflector);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('passes on @Public() routes regardless of roles', () => {
    const { reflector, context } = createMockContext({
      isPublic: true,
      roles: [UserRole.ADMIN],
      userRole: null,
    });
    const guard = new RolesGuard(reflector);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('passes when user role matches the required role', () => {
    const { reflector, context } = createMockContext({
      roles: [UserRole.ADMIN],
      userRole: UserRole.ADMIN,
    });
    const guard = new RolesGuard(reflector);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('passes when user role is one of multiple required roles', () => {
    const { reflector, context } = createMockContext({
      roles: [UserRole.ADMIN, UserRole.MENTOR],
      userRole: UserRole.MENTOR,
    });
    const guard = new RolesGuard(reflector);
    expect(guard.canActivate(context)).toBe(true);
  });

  it('throws ForbiddenException when user role does not match required role', () => {
    const { reflector, context } = createMockContext({
      roles: [UserRole.ADMIN],
      userRole: UserRole.MENTEE,
    });
    const guard = new RolesGuard(reflector);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException when req.user is undefined (unauthenticated)', () => {
    const { reflector, context } = createMockContext({
      roles: [UserRole.ADMIN],
      userRole: null,
    });
    const guard = new RolesGuard(reflector);
    expect(() => guard.canActivate(context)).toThrow(ForbiddenException);
  });

  it('throws ForbiddenException with "Insufficient permissions" message', () => {
    const { reflector, context } = createMockContext({
      roles: [UserRole.ADMIN],
      userRole: UserRole.MENTEE,
    });
    const guard = new RolesGuard(reflector);
    expect(() => guard.canActivate(context)).toThrow('Insufficient permissions');
  });
});
