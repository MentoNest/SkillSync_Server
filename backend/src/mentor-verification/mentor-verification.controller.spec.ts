import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ROLES_KEY } from '../rbac/roles.decorator';
import { RolesGuard } from '../rbac/roles.guard';
import { RoleName } from '../rbac/roles';
import { AdminMentorVerificationController } from './mentor-verification.controller';

describe('MentorVerification RBAC', () => {
  const reflector = new Reflector();
  const guard = new RolesGuard(reflector);

  const contextFor = (roles: string[]): ExecutionContext =>
    ({
      getHandler: () => AdminMentorVerificationController.prototype.verify,
      getClass: () => AdminMentorVerificationController,
      switchToHttp: () => ({ getRequest: () => ({ user: { roles } }) }),
    }) as unknown as ExecutionContext;

  it('requires the admin role on the admin controller', () => {
    expect(reflector.get<string[]>(ROLES_KEY, AdminMentorVerificationController)).toEqual([RoleName.ADMIN]);
  });

  it('allows admins', () => {
    expect(guard.canActivate(contextFor([RoleName.ADMIN]))).toBe(true);
  });

  it('blocks non-admins', () => {
    expect(() => guard.canActivate(contextFor([RoleName.MENTOR]))).toThrow();
    expect(() => guard.canActivate(contextFor([RoleName.MENTEE]))).toThrow();
  });
});
