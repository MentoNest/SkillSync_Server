import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { RoleName } from '../rbac/roles';
import { ROLES_KEY } from '../rbac/roles.decorator';
import { RolesGuard } from '../rbac/roles.guard';
import { AdminController } from './admin.controller';

function contextFor(handler: Function, user: unknown) {
  return {
    getHandler: () => handler,
    getClass: () => AdminController,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as any;
}

describe('admin API permissions', () => {
  const guard = new RolesGuard(new Reflector());
  const handlers = Object.getOwnPropertyNames(AdminController.prototype).filter(
    (name) => name !== 'constructor',
  );

  it('requires the admin role on the whole /admin controller', () => {
    expect(Reflect.getMetadata(ROLES_KEY, AdminController)).toEqual([RoleName.ADMIN]);
    expect(handlers.length).toBeGreaterThanOrEqual(10);
  });

  it.each(handlers)('%s rejects mentors, mentees and anonymous callers', (name) => {
    const handler = (AdminController.prototype as any)[name];
    expect(() => guard.canActivate(contextFor(handler, { roles: [RoleName.MENTOR] }))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(contextFor(handler, { roles: [RoleName.MENTEE] }))).toThrow(ForbiddenException);
    expect(() => guard.canActivate(contextFor(handler, undefined))).toThrow(ForbiddenException);
  });

  it.each(handlers)('%s allows admins', (name) => {
    const handler = (AdminController.prototype as any)[name];
    expect(guard.canActivate(contextFor(handler, { roles: [RoleName.ADMIN] }))).toBe(true);
  });
});
