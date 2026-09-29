/**
 * #1342 (account suspension) and #1343 (account status access control).
 *
 * Both features are enforced in the same place: `RolesGuard.canActivate`, which
 * reads the user from the database on every request rather than trusting the
 * token. That matters for these two issues in particular - a token minted while
 * an account was active must stop working the moment the account is suspended
 * or deleted, and a suspension must start working even though the token was
 * issued before the suspension.
 *
 * The guard is exercised through a real `ExecutionContext` double with mocked
 * repositories. Three behaviours carry most of the risk and are covered in
 * detail:
 *
 * 1. a lapsed temporary suspension is auto-expired and the user is let back in;
 * 2. a still-running or permanent suspension is refused with a specific code;
 * 3. a deleted or unverified account is refused, and `@AllowInactiveStatus()`
 *    is the documented escape hatch for the routes that must still work.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Repository } from 'typeorm';
import { RolesGuard } from './roles.guard.js';
import { ROLES_KEY } from '../decorators/roles.decorator.js';
import { PERMISSIONS_KEY } from '../decorators/permissions.decorator.js';
import { ALLOW_INACTIVE_STATUS_KEY } from '../decorators/allow-inactive-status.decorator.js';
import { User, UserStatus } from '../entities/user.entity.js';
import { Role } from '../entities/role.entity.js';
import { UserSuspension } from '../user/entities/user-suspension.entity.js';

const USER_ID = '11111111-1111-4111-8111-111111111111';

/** Builds a user with the fields the guard actually reads. */
function makeUser(overrides: Partial<User> = {}): User {
  const user = new User();
  Object.assign(
    user,
    {
      id: USER_ID,
      status: UserStatus.ACTIVE,
      isLocked: false,
      lockoutUntil: null,
      tokenVersion: 0,
      deletedAt: null,
      roles: [],
    },
    overrides,
  );
  return user;
}

/** Builds a suspension row; `suspendedUntil: null` means permanent. */
function makeSuspension(
  overrides: Partial<UserSuspension> = {},
): UserSuspension {
  const suspension = new UserSuspension();
  Object.assign(
    suspension,
    {
      id: '22222222-2222-4222-8222-222222222222',
      userId: USER_ID,
      reason: 'Repeated no-shows on booked sessions',
      suspendedBy: '33333333-3333-4333-8333-333333333333',
      suspendedAt: new Date('2026-01-01T00:00:00Z'),
      suspendedUntil: null,
      isActive: true,
      liftedAt: null,
      liftedBy: null,
      liftReason: null,
    },
    overrides,
  );
  return suspension;
}

/** Metadata the reflector should return for the route under test. */
interface RouteMetadata {
  roles?: string[];
  permissions?: string[];
  allowInactiveStatus?: boolean;
}

/**
 * A Reflector double. The guard constructs its own Reflector, so route metadata
 * has to be injected through the constructor rather than hung off the context.
 */
function makeReflector(metadata: RouteMetadata): Reflector {
  return {
    getAllAndOverride: (key: string) => {
      if (key === ROLES_KEY) return metadata.roles;
      if (key === PERMISSIONS_KEY) return metadata.permissions;
      if (key === ALLOW_INACTIVE_STATUS_KEY)
        return metadata.allowInactiveStatus;
      return undefined;
    },
  } as unknown as Reflector;
}

/** A minimal ExecutionContext double returning the given request. */
function makeContext(token: string | undefined): ExecutionContext {
  const handler = () => undefined;
  const request: Record<string, unknown> = {
    headers: token ? { authorization: `Bearer ${token}` } : {},
  };

  return {
    getHandler: () => handler,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('RolesGuard - suspension expiry (#1342)', () => {
  let userRepository: {
    findOne: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };
  let suspensionRepository: {
    findOne: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    userRepository = {
      findOne: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
    };
    suspensionRepository = {
      findOne: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
    };
  });

  function buildGuard(metadata: RouteMetadata = {}): RolesGuard {
    return new RolesGuard(
      makeReflector(metadata),
      {
        verify: vi.fn().mockReturnValue({ sub: USER_ID, tokenVersion: 0 }),
      } as unknown as JwtService,
      userRepository as unknown as Repository<User>,
      { find: vi.fn() } as unknown as Repository<Role>,
      suspensionRepository as unknown as Repository<UserSuspension>,
    );
  }

  it('lifts a suspension that has passed and lets the user through', async () => {
    const user = makeUser({ status: UserStatus.SUSPENDED });
    const suspension = makeSuspension({
      suspendedUntil: new Date(Date.now() - 1000), // lapsed a second ago
    });
    userRepository.findOne.mockResolvedValue(user);
    suspensionRepository.findOne.mockResolvedValue(suspension);

    await expect(buildGuard().canActivate(makeContext('token'))).resolves.toBe(
      true,
    );

    expect(user.status).toBe(UserStatus.ACTIVE);
    expect(suspension.isActive).toBe(false);
    expect(suspension.liftReason).toBe('expired');
    expect(suspension.liftedAt).toBeInstanceOf(Date);
    expect(userRepository.save).toHaveBeenCalledWith(user);
  });

  it('keeps a suspension that has not yet lapsed', async () => {
    const user = makeUser({ status: UserStatus.SUSPENDED });
    const suspension = makeSuspension({
      suspendedUntil: new Date(Date.now() + 60_000), // an hour from now
    });
    userRepository.findOne.mockResolvedValue(user);
    suspensionRepository.findOne.mockResolvedValue(suspension);

    await expect(
      buildGuard().canActivate(makeContext('token')),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(user.status).toBe(UserStatus.SUSPENDED);
    expect(suspension.isActive).toBe(true);
    expect(suspensionRepository.save).not.toHaveBeenCalled();
  });

  it('refuses a permanent suspension, which has no expiry to lapse', async () => {
    const user = makeUser({ status: UserStatus.SUSPENDED });
    userRepository.findOne.mockResolvedValue(user);
    suspensionRepository.findOne.mockResolvedValue(
      makeSuspension({ suspendedUntil: null }),
    );

    const error = await buildGuard()
      .canActivate(makeContext('token'))
      .catch((thrown: unknown) => thrown as ForbiddenException);

    expect(error).toBeInstanceOf(ForbiddenException);
    expect(user.status).toBe(UserStatus.SUSPENDED);
  });

  it('refuses a suspended user even when the suspension row has gone missing', async () => {
    const user = makeUser({ status: UserStatus.SUSPENDED });
    userRepository.findOne.mockResolvedValue(user);
    suspensionRepository.findOne.mockResolvedValue(null);

    await expect(
      buildGuard().canActivate(makeContext('token')),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(userRepository.save).not.toHaveBeenCalled();
  });

  it('looks up the active suspension by user, newest first', async () => {
    const user = makeUser({ status: UserStatus.SUSPENDED });
    userRepository.findOne.mockResolvedValue(user);
    suspensionRepository.findOne.mockResolvedValue(
      makeSuspension({ suspendedUntil: new Date(Date.now() + 60_000) }),
    );

    await buildGuard()
      .canActivate(makeContext('token'))
      .catch(() => undefined);

    expect(suspensionRepository.findOne).toHaveBeenCalledWith({
      where: { userId: USER_ID, isActive: true },
      order: { suspendedAt: 'DESC' },
    });
  });

  it('never lifts a suspension on a route that opts into inactive statuses', async () => {
    const user = makeUser({ status: UserStatus.SUSPENDED });
    const suspension = makeSuspension({
      suspendedUntil: new Date(Date.now() - 1000),
    });
    userRepository.findOne.mockResolvedValue(user);
    suspensionRepository.findOne.mockResolvedValue(suspension);

    await expect(
      buildGuard({ allowInactiveStatus: true }).canActivate(
        makeContext('token'),
      ),
    ).resolves.toBe(true);

    // The bypass skips the whole block, including the auto-expiry side effect.
    expect(suspensionRepository.findOne).not.toHaveBeenCalled();
    expect(user.status).toBe(UserStatus.SUSPENDED);
  });
});

describe('RolesGuard - status-based access control (#1343)', () => {
  let userRepository: {
    findOne: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };
  let suspensionRepository: {
    findOne: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    userRepository = {
      findOne: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
    };
    suspensionRepository = {
      findOne: vi.fn(),
      save: vi.fn().mockResolvedValue(undefined),
    };
  });

  function buildGuard(metadata: RouteMetadata = {}): RolesGuard {
    return new RolesGuard(
      makeReflector(metadata),
      {
        verify: vi.fn().mockReturnValue({ sub: USER_ID, tokenVersion: 0 }),
      } as unknown as JwtService,
      userRepository as unknown as Repository<User>,
      { find: vi.fn() } as unknown as Repository<Role>,
      suspensionRepository as unknown as Repository<UserSuspension>,
    );
  }

  it('lets an active user through', async () => {
    userRepository.findOne.mockResolvedValue(makeUser());

    await expect(buildGuard().canActivate(makeContext('token'))).resolves.toBe(
      true,
    );
  });

  it.each([UserStatus.PENDING_VERIFICATION, UserStatus.DELETED])(
    'refuses a %s user with 403',
    async (status) => {
      userRepository.findOne.mockResolvedValue(makeUser({ status }));

      await expect(
        buildGuard().canActivate(makeContext('token')),
      ).rejects.toBeInstanceOf(ForbiddenException);
    },
  );

  it('carries a machine-readable code in the refusal', async () => {
    userRepository.findOne.mockResolvedValue(
      makeUser({ status: UserStatus.DELETED }),
    );

    const error = (await buildGuard()
      .canActivate(makeContext('token'))
      .catch((thrown: unknown) => thrown)) as ForbiddenException;
    const payload = error.getResponse() as Record<string, unknown>;

    expect(payload.code).toBe('account_deleted');
    expect(payload.statusCode).toBe(403);
  });

  it('distinguishes a pending account from a deleted one', async () => {
    userRepository.findOne.mockResolvedValue(
      makeUser({ status: UserStatus.PENDING_VERIFICATION }),
    );

    const error = (await buildGuard()
      .canActivate(makeContext('token'))
      .catch((thrown: unknown) => thrown)) as ForbiddenException;

    expect((error.getResponse() as Record<string, unknown>).code).toBe(
      'account_pending_verification',
    );
  });

  it('includes the suspension reason and expiry for a suspended user', async () => {
    const suspendedUntil = new Date(Date.now() + 86_400_000);
    userRepository.findOne.mockResolvedValue(
      makeUser({ status: UserStatus.SUSPENDED }),
    );
    suspensionRepository.findOne.mockResolvedValue(
      makeSuspension({ suspendedUntil }),
    );

    const error = (await buildGuard()
      .canActivate(makeContext('token'))
      .catch((thrown: unknown) => thrown)) as ForbiddenException;
    const payload = error.getResponse() as Record<string, unknown>;

    expect(payload.code).toBe('account_suspended');
    expect(payload.reason).toBe('Repeated no-shows on booked sessions');
    expect(payload.suspendedUntil).toBe(suspendedUntil);
  });

  it.each([
    UserStatus.PENDING_VERIFICATION,
    UserStatus.DELETED,
    UserStatus.SUSPENDED,
  ])(
    'allows a %s user through a route marked @AllowInactiveStatus()',
    async (status) => {
      userRepository.findOne.mockResolvedValue(makeUser({ status }));

      await expect(
        buildGuard({ allowInactiveStatus: true }).canActivate(
          makeContext('token'),
        ),
      ).resolves.toBe(true);

      expect(suspensionRepository.findOne).not.toHaveBeenCalled();
    },
  );

  it('enforces role requirements for an active user', async () => {
    userRepository.findOne.mockResolvedValue(
      makeUser({ roles: [{ name: 'mentor' } as unknown as Role] }),
    );

    await expect(
      buildGuard({ roles: ['mentor'] }).canActivate(makeContext('token')),
    ).resolves.toBe(true);
  });

  it('refuses an active user who lacks the required role', async () => {
    userRepository.findOne.mockResolvedValue(
      makeUser({ roles: [{ name: 'mentee' } as unknown as Role] }),
    );

    await expect(
      buildGuard({ roles: ['admin'] }).canActivate(makeContext('token')),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('enforces permission requirements after the status check', async () => {
    userRepository.findOne.mockResolvedValue(
      makeUser({ roles: [{ name: 'mentor' } as unknown as Role] }),
    );

    await expect(
      buildGuard({ permissions: ['profile:read'] }).canActivate(
        makeContext('token'),
      ),
    ).resolves.toBe(true);

    await expect(
      buildGuard({ permissions: ['user:delete'] }).canActivate(
        makeContext('token'),
      ),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses a request with no token once a role is required', async () => {
    await expect(
      buildGuard({ roles: ['admin'] }).canActivate(makeContext(undefined)),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows a public route with no token and no requirements', async () => {
    await expect(
      buildGuard().canActivate(makeContext(undefined)),
    ).resolves.toBe(true);
  });

  it('refuses a token whose user no longer exists', async () => {
    userRepository.findOne.mockResolvedValue(null);

    await expect(
      buildGuard().canActivate(makeContext('token')),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('refuses a token invalidated by a tokenVersion bump', async () => {
    userRepository.findOne.mockResolvedValue(makeUser({ tokenVersion: 5 }));

    const guard = new RolesGuard(
      new Reflector(),
      {
        verify: vi.fn().mockReturnValue({ sub: USER_ID, tokenVersion: 0 }),
      } as unknown as JwtService,
      userRepository as unknown as Repository<User>,
      { find: vi.fn() } as unknown as Repository<Role>,
      suspensionRepository as unknown as Repository<UserSuspension>,
    );

    await expect(
      guard.canActivate(makeContext('token')),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('unlocks an account whose lockout has expired', async () => {
    const user = makeUser({
      isLocked: true,
      lockoutUntil: new Date(Date.now() - 1000),
    });
    userRepository.findOne.mockResolvedValue(user);

    await expect(buildGuard().canActivate(makeContext('token'))).resolves.toBe(
      true,
    );

    expect(user.isLocked).toBe(false);
    expect(user.lockoutUntil).toBeNull();
  });

  it('keeps a lockout that has not yet expired', async () => {
    const user = makeUser({
      isLocked: true,
      lockoutUntil: new Date(Date.now() + 60_000),
    });
    userRepository.findOne.mockResolvedValue(user);

    await expect(
      buildGuard().canActivate(makeContext('token')),
    ).rejects.toBeInstanceOf(ForbiddenException);

    expect(user.isLocked).toBe(true);
  });
});
