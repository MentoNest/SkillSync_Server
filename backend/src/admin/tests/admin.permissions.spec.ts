import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Reflector } from '@nestjs/core';
import { Role } from '../../auth/auth.types';
import { ROLES_KEY } from '../../auth/decorators/roles.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../../auth/guards/roles.guard';
import { AdminController, ReportsController } from '../admin.controller';

type Handler = (...args: never[]) => unknown;

function contextFor(
  handler: Handler,
  controller: object,
  user?: unknown,
): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => ({ user }) }),
  } as unknown as ExecutionContext;
}

describe('admin API permissions', () => {
  const guard = new RolesGuard(new Reflector());
  const handlers = Object.getOwnPropertyNames(AdminController.prototype).filter(
    (name) => name !== 'constructor',
  );

  it('requires ADMIN on the whole controller and installs both guards', () => {
    expect(Reflect.getMetadata(ROLES_KEY, AdminController)).toEqual([
      Role.ADMIN,
    ]);
    expect(Reflect.getMetadata(GUARDS_METADATA, AdminController)).toEqual(
      expect.arrayContaining([JwtAuthGuard, RolesGuard]),
    );
    expect(handlers.length).toBeGreaterThanOrEqual(20);
  });

  it.each(handlers)('%s rejects non-admin and anonymous callers', (name) => {
    const handler = (
      AdminController.prototype as unknown as Record<string, Handler>
    )[name];
    expect(() =>
      guard.canActivate(
        contextFor(handler, AdminController, { roles: [Role.USER] }),
      ),
    ).toThrow(ForbiddenException);
    expect(() =>
      guard.canActivate(
        contextFor(handler, AdminController, { roles: [Role.MENTOR] }),
      ),
    ).toThrow(ForbiddenException);
    expect(() =>
      guard.canActivate(contextFor(handler, AdminController)),
    ).toThrow(ForbiddenException);
  });

  it.each(handlers)('%s allows admins', (name) => {
    const handler = (
      AdminController.prototype as unknown as Record<string, Handler>
    )[name];
    expect(
      guard.canActivate(
        contextFor(handler, AdminController, { roles: [Role.ADMIN] }),
      ),
    ).toBe(true);
  });

  it('keeps the public report endpoint signed-in but not admin-only', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, ReportsController)).toEqual([
      JwtAuthGuard,
    ]);
    expect(Reflect.getMetadata(ROLES_KEY, ReportsController)).toBeUndefined();
    const handler: Handler = () => undefined;
    expect(
      guard.canActivate(
        contextFor(handler, ReportsController, { roles: [Role.USER] }),
      ),
    ).toBe(true);
  });
});
