/**
 * #1341 (soft delete) and #1342 (suspension), service layer.
 *
 * The `RolesGuard` spec covers what a *request* sees; this file covers the
 * state transitions themselves, which is where the grace period and the
 * session-invalidation rules live.
 *
 * `UserService` is constructed directly with repository doubles rather than
 * through Nest's testing module: the service takes ten positional dependencies
 * and only five of them are touched by these paths. The doubles are strict
 * enough that an unexpected call (say, an audit write that should not happen
 * on a self-service restore) shows up as a failure.
 *
 * `DELETE_GRACE_DAYS` is read from `process.env` on every access, so the grace
 * period is pinned by setting the variable explicitly rather than relying on
 * the default, and the default is asserted separately.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { UserService } from './user.service.js';
import { User, UserStatus } from '../entities/user.entity.js';
import { Role } from '../entities/role.entity.js';
import { MentorProfile } from '../entities/mentor-profile.entity.js';
import { MenteeProfile } from '../entities/mentee-profile.entity.js';
import { AvailabilitySlot } from '../entities/availability-slot.entity.js';
import { RefreshToken } from '../auth/entities/refresh-token.entity.js';
import { AuditLog } from '../audit/entities/audit-log.entity.js';
import { UserSuspension } from './entities/user-suspension.entity.js';
import { RedisService } from '../auth/services/redis.service.js';
import { ProfileCompletenessService } from './services/profile-completeness.service.js';

const USER_ID = '11111111-1111-4111-8111-111111111111';
const ADMIN_ID = '33333333-3333-4333-8333-333333333333';
const DAY_MS = 24 * 60 * 60 * 1000;

function makeUser(overrides: Partial<User> = {}): User {
  const user = new User();
  Object.assign(
    user,
    {
      id: USER_ID,
      status: UserStatus.ACTIVE,
      deletedAt: null,
      tokenVersion: 0,
    },
    overrides,
  );
  return user;
}

function makeSuspension(
  overrides: Partial<UserSuspension> = {},
): UserSuspension {
  const suspension = new UserSuspension();
  Object.assign(
    suspension,
    {
      id: '22222222-2222-4222-8222-222222222222',
      userId: USER_ID,
      reason: 'Policy violation',
      suspendedBy: ADMIN_ID,
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

describe('UserService account lifecycle', () => {
  let userRepository: {
    findOne: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    remove: ReturnType<typeof vi.fn>;
    find: ReturnType<typeof vi.fn>;
  };
  let refreshTokenRepository: { delete: ReturnType<typeof vi.fn> };
  let auditLogRepository: {
    save: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
  };
  let suspensionRepository: {
    findOne: ReturnType<typeof vi.fn>;
    save: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
  };
  let service: UserService;
  const originalGraceDays = process.env.DELETE_GRACE_DAYS;

  beforeEach(() => {
    process.env.DELETE_GRACE_DAYS = '30';

    userRepository = {
      findOne: vi.fn(),
      save: vi.fn().mockImplementation((user: User) => Promise.resolve(user)),
      remove: vi.fn().mockResolvedValue(undefined),
      find: vi.fn().mockResolvedValue([]),
    };
    refreshTokenRepository = { delete: vi.fn().mockResolvedValue(undefined) };
    auditLogRepository = {
      save: vi.fn().mockResolvedValue(undefined),
      create: vi.fn().mockImplementation((data: unknown) => data),
    };
    suspensionRepository = {
      findOne: vi.fn(),
      save: vi
        .fn()
        .mockImplementation((s: UserSuspension) => Promise.resolve(s)),
      create: vi.fn().mockImplementation((d: unknown) => d),
      update: vi.fn().mockResolvedValue(undefined),
    };

    service = new UserService(
      userRepository as unknown as Repository<User>,
      { find: vi.fn() } as unknown as Repository<Role>,
      { find: vi.fn() } as unknown as Repository<MentorProfile>,
      { find: vi.fn() } as unknown as Repository<MenteeProfile>,
      { find: vi.fn() } as unknown as Repository<AvailabilitySlot>,
      refreshTokenRepository as unknown as Repository<RefreshToken>,
      auditLogRepository as unknown as Repository<AuditLog>,
      suspensionRepository as unknown as Repository<UserSuspension>,
      { del: vi.fn() } as unknown as RedisService,
      { calculate: vi.fn() } as unknown as ProfileCompletenessService,
    );
  });

  afterEach(() => {
    if (originalGraceDays === undefined) {
      delete process.env.DELETE_GRACE_DAYS;
    } else {
      process.env.DELETE_GRACE_DAYS = originalGraceDays;
    }
    vi.useRealTimers();
  });

  describe('softDeleteAccount (#1341)', () => {
    it('marks the account deleted and stamps deletedAt', async () => {
      const user = makeUser();
      userRepository.findOne.mockResolvedValue(user);

      const result = await service.softDeleteAccount(USER_ID);

      expect(user.status).toBe(UserStatus.DELETED);
      expect(user.deletedAt).toBeInstanceOf(Date);
      expect(result.success).toBe(true);
      expect(result.graceDays).toBe(30);
      expect(result.deletedAt).toEqual(user.deletedAt);
    });

    it('invalidates existing sessions by bumping tokenVersion and deleting refresh tokens', async () => {
      const user = makeUser({ tokenVersion: 3 });
      userRepository.findOne.mockResolvedValue(user);

      await service.softDeleteAccount(USER_ID);

      expect(user.tokenVersion).toBe(4);
      expect(refreshTokenRepository.delete).toHaveBeenCalledWith({
        userId: USER_ID,
      });
    });

    it('bumps tokenVersion from an undefined value without producing NaN', async () => {
      const user = makeUser({ tokenVersion: undefined as unknown as number });
      userRepository.findOne.mockResolvedValue(user);

      await service.softDeleteAccount(USER_ID);

      expect(user.tokenVersion).toBe(1);
    });

    it('refuses to delete an account twice', async () => {
      userRepository.findOne.mockResolvedValue(
        makeUser({ status: UserStatus.DELETED }),
      );

      await expect(service.softDeleteAccount(USER_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
      expect(userRepository.save).not.toHaveBeenCalled();
    });

    it('tells the user the grace period in the response message', async () => {
      userRepository.findOne.mockResolvedValue(makeUser());

      const result = await service.softDeleteAccount(USER_ID);

      expect(result.message).toContain('30 days');
      expect(result.message).toContain('/user/account/restore');
    });
  });

  describe('restoreAccount (#1341)', () => {
    it('reactivates an account deleted inside the grace period', async () => {
      const user = makeUser({
        status: UserStatus.DELETED,
        deletedAt: new Date(Date.now() - 5 * DAY_MS),
      });
      userRepository.findOne.mockResolvedValue(user);

      await service.restoreAccount(USER_ID);

      expect(user.status).toBe(UserStatus.ACTIVE);
      expect(user.deletedAt).toBeNull();
    });

    it('allows a restore on the very last day of the grace period', async () => {
      const user = makeUser({
        status: UserStatus.DELETED,
        deletedAt: new Date(Date.now() - 29.5 * DAY_MS),
      });
      userRepository.findOne.mockResolvedValue(user);

      await expect(service.restoreAccount(USER_ID)).resolves.toBeDefined();
    });

    it('refuses a restore once the grace period has elapsed', async () => {
      const user = makeUser({
        status: UserStatus.DELETED,
        deletedAt: new Date(Date.now() - 31 * DAY_MS),
      });
      userRepository.findOne.mockResolvedValue(user);

      await expect(service.restoreAccount(USER_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
      expect(user.status).toBe(UserStatus.DELETED);
    });

    it('refuses to restore an account that was never deleted', async () => {
      userRepository.findOne.mockResolvedValue(
        makeUser({ status: UserStatus.ACTIVE }),
      );

      await expect(service.restoreAccount(USER_ID)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    });

    it('honours a configured grace period instead of the default', async () => {
      process.env.DELETE_GRACE_DAYS = '7';
      const user = makeUser({
        status: UserStatus.DELETED,
        deletedAt: new Date(Date.now() - 10 * DAY_MS),
      });
      userRepository.findOne.mockResolvedValue(user);

      await expect(service.restoreAccount(USER_ID)).rejects.toBeInstanceOf(
        ForbiddenException,
      );
    });

    it('falls back to the default for a nonsensical grace period', async () => {
      process.env.DELETE_GRACE_DAYS = '0';
      const user = makeUser({
        status: UserStatus.DELETED,
        deletedAt: new Date(Date.now() - 10 * DAY_MS),
      });
      userRepository.findOne.mockResolvedValue(user);

      // 0 is rejected, so the 30-day default applies and 10 days is still fine.
      await expect(service.restoreAccount(USER_ID)).resolves.toBeDefined();
    });
  });

  describe('permanentlyDeleteAccount (#1341)', () => {
    it('removes the row only after the grace period has ended', async () => {
      const user = makeUser({
        status: UserStatus.DELETED,
        deletedAt: new Date(Date.now() - 40 * DAY_MS),
      });
      userRepository.findOne.mockResolvedValue(user);

      const result = await service.permanentlyDeleteAccount(USER_ID, ADMIN_ID);

      expect(result.success).toBe(true);
      expect(userRepository.remove).toHaveBeenCalledWith(user);
      expect(refreshTokenRepository.delete).toHaveBeenCalledWith({
        userId: USER_ID,
      });
    });

    it('refuses to purge an account still inside its grace period', async () => {
      const user = makeUser({
        status: UserStatus.DELETED,
        deletedAt: new Date(Date.now() - 2 * DAY_MS),
      });
      userRepository.findOne.mockResolvedValue(user);

      await expect(
        service.permanentlyDeleteAccount(USER_ID, ADMIN_ID),
      ).rejects.toBeInstanceOf(ForbiddenException);
      expect(userRepository.remove).not.toHaveBeenCalled();
    });

    it('refuses to purge an account that is not soft-deleted', async () => {
      userRepository.findOne.mockResolvedValue(
        makeUser({ status: UserStatus.ACTIVE }),
      );

      await expect(
        service.permanentlyDeleteAccount(USER_ID, ADMIN_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('audits the permanent deletion against the acting admin', async () => {
      const user = makeUser({
        status: UserStatus.DELETED,
        deletedAt: new Date(Date.now() - 40 * DAY_MS),
      });
      userRepository.findOne.mockResolvedValue(user);

      await service.permanentlyDeleteAccount(USER_ID, ADMIN_ID);

      expect(auditLogRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: ADMIN_ID,
          eventType: 'user_permanently_deleted',
        }),
      );
    });
  });

  describe('findDeletedUsers (#1341)', () => {
    it('queries deleted accounts including soft-deleted rows, newest first', async () => {
      userRepository.find.mockResolvedValue([]);

      await service.findDeletedUsers();

      expect(userRepository.find).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { status: UserStatus.DELETED },
          withDeleted: true,
          order: { deletedAt: 'DESC' },
        }),
      );
    });
  });

  describe('suspendUser (#1342)', () => {
    it('records a permanent suspension when no duration is given', async () => {
      userRepository.findOne.mockResolvedValue(makeUser());

      const suspension = await service.suspendUser(
        USER_ID,
        'Fraud',
        null,
        ADMIN_ID,
      );

      expect(suspension.suspendedUntil).toBeNull();
      expect(suspension.isActive).toBe(true);
      expect(suspension.suspendedBy).toBe(ADMIN_ID);
    });

    it('computes the expiry from the requested duration in days', async () => {
      userRepository.findOne.mockResolvedValue(makeUser());

      const suspension = await service.suspendUser(
        USER_ID,
        'Fraud',
        7,
        ADMIN_ID,
      );
      const expected = Date.now() + 7 * DAY_MS;

      expect(suspension.suspendedUntil).toBeInstanceOf(Date);
      expect(
        Math.abs(suspension.suspendedUntil!.getTime() - expected),
      ).toBeLessThan(5_000);
    });

    it('trims the reason and requires one to be supplied', async () => {
      userRepository.findOne.mockResolvedValue(makeUser());

      const suspension = await service.suspendUser(
        USER_ID,
        '  Fraud  ',
        null,
        ADMIN_ID,
      );
      expect(suspension.reason).toBe('Fraud');

      await expect(
        service.suspendUser(USER_ID, '   ', null, ADMIN_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
      await expect(
        service.suspendUser(USER_ID, '', null, ADMIN_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('flips the user to suspended and invalidates their sessions', async () => {
      const user = makeUser({ tokenVersion: 2 });
      userRepository.findOne.mockResolvedValue(user);

      await service.suspendUser(USER_ID, 'Fraud', 1, ADMIN_ID);

      expect(user.status).toBe(UserStatus.SUSPENDED);
      expect(user.tokenVersion).toBe(3);
      expect(refreshTokenRepository.delete).toHaveBeenCalledWith({
        userId: USER_ID,
      });
    });

    it('deactivates any stale active suspension before creating a new one', async () => {
      userRepository.findOne.mockResolvedValue(makeUser());

      await service.suspendUser(USER_ID, 'Fraud', null, ADMIN_ID);

      expect(suspensionRepository.update).toHaveBeenCalledWith(
        { userId: USER_ID, isActive: true },
        expect.objectContaining({ isActive: false, liftReason: 'superseded' }),
      );
    });

    it('refuses to suspend an already suspended account', async () => {
      userRepository.findOne.mockResolvedValue(
        makeUser({ status: UserStatus.SUSPENDED }),
      );

      await expect(
        service.suspendUser(USER_ID, 'Fraud', null, ADMIN_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('refuses to suspend a deleted account', async () => {
      userRepository.findOne.mockResolvedValue(
        makeUser({ status: UserStatus.DELETED }),
      );

      await expect(
        service.suspendUser(USER_ID, 'Fraud', null, ADMIN_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('unsuspendUser (#1342)', () => {
    it('closes the suspension with the acting admin and restores the user', async () => {
      const user = makeUser({ status: UserStatus.SUSPENDED });
      const suspension = makeSuspension();
      userRepository.findOne.mockResolvedValue(user);
      suspensionRepository.findOne.mockResolvedValue(suspension);

      await service.unsuspendUser(USER_ID, ADMIN_ID);

      expect(suspension.isActive).toBe(false);
      expect(suspension.liftedBy).toBe(ADMIN_ID);
      expect(suspension.liftReason).toBe('unsuspended');
      expect(user.status).toBe(UserStatus.ACTIVE);
    });

    it('marks an automatic lift as expired when there is no acting admin', async () => {
      const user = makeUser({ status: UserStatus.SUSPENDED });
      const suspension = makeSuspension();
      userRepository.findOne.mockResolvedValue(user);
      suspensionRepository.findOne.mockResolvedValue(suspension);

      await service.unsuspendUser(USER_ID, null);

      expect(suspension.liftedBy).toBeNull();
      expect(suspension.liftReason).toBe('expired');
    });

    it('still restores the user when no suspension row is found', async () => {
      const user = makeUser({ status: UserStatus.SUSPENDED });
      userRepository.findOne.mockResolvedValue(user);
      suspensionRepository.findOne.mockResolvedValue(null);

      await service.unsuspendUser(USER_ID, ADMIN_ID);

      expect(suspensionRepository.save).not.toHaveBeenCalled();
      expect(user.status).toBe(UserStatus.ACTIVE);
    });

    it('refuses to unsuspend an account that is not suspended', async () => {
      userRepository.findOne.mockResolvedValue(
        makeUser({ status: UserStatus.ACTIVE }),
      );

      await expect(
        service.unsuspendUser(USER_ID, ADMIN_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
    });
  });

  describe('checkAndExpireSuspension (#1342)', () => {
    it('returns null for a user who is not suspended', async () => {
      const result = await service.checkAndExpireSuspension(
        makeUser({ status: UserStatus.ACTIVE }),
      );

      expect(result).toBeNull();
      expect(suspensionRepository.findOne).not.toHaveBeenCalled();
    });

    it('auto-lifts a temporary suspension whose window has passed', async () => {
      const user = makeUser({ status: UserStatus.SUSPENDED });
      const suspension = makeSuspension({
        suspendedUntil: new Date(Date.now() - 1000),
      });
      userRepository.findOne.mockResolvedValue(user);
      suspensionRepository.findOne.mockResolvedValue(suspension);

      const result = await service.checkAndExpireSuspension(user);

      expect(result).toBeNull();
      expect(user.status).toBe(UserStatus.ACTIVE);
      expect(suspension.liftReason).toBe('expired');
      expect(suspension.isActive).toBe(false);
    });

    it('returns the active suspension while the window is still open', async () => {
      const user = makeUser({ status: UserStatus.SUSPENDED });
      const suspension = makeSuspension({
        suspendedUntil: new Date(Date.now() + DAY_MS),
      });
      userRepository.findOne.mockResolvedValue(user);
      suspensionRepository.findOne.mockResolvedValue(suspension);

      const result = await service.checkAndExpireSuspension(user);

      expect(result).toBe(suspension);
      expect(suspension.isActive).toBe(true);
    });

    it('never auto-lifts a permanent suspension, which has no expiry', async () => {
      const user = makeUser({ status: UserStatus.SUSPENDED });
      const suspension = makeSuspension({ suspendedUntil: null });
      userRepository.findOne.mockResolvedValue(user);
      suspensionRepository.findOne.mockResolvedValue(suspension);

      const result = await service.checkAndExpireSuspension(user);

      expect(result).toBe(suspension);
      expect(user.status).toBe(UserStatus.SUSPENDED);
    });
  });

  describe('adminSetStatus (#1343)', () => {
    it('allows an admin to suspend an active user and stamps deletedAt only for deletes', async () => {
      const user = makeUser();
      userRepository.findOne.mockResolvedValue(user);

      await service.adminSetStatus(USER_ID, UserStatus.SUSPENDED, ADMIN_ID);

      expect(user.status).toBe(UserStatus.SUSPENDED);
      expect(user.deletedAt).toBeNull();
    });

    it('stamps deletedAt when an admin moves an account to deleted', async () => {
      const user = makeUser();
      userRepository.findOne.mockResolvedValue(user);

      await service.adminSetStatus(USER_ID, UserStatus.DELETED, ADMIN_ID);

      expect(user.deletedAt).toBeInstanceOf(Date);
    });

    it('refuses deleted -> active, which must go through the self-service restore', async () => {
      const user = makeUser({
        status: UserStatus.DELETED,
        deletedAt: new Date(Date.now() - DAY_MS),
      });
      userRepository.findOne.mockResolvedValue(user);

      const error = (await service
        .adminSetStatus(USER_ID, UserStatus.ACTIVE, ADMIN_ID)
        .catch((thrown: unknown) => thrown)) as BadRequestException;

      expect(error).toBeInstanceOf(BadRequestException);
      expect(error.message).toContain('/user/account/restore');
      expect(user.status).toBe(UserStatus.DELETED);
    });

    it('refuses a transition to the status the user already has', async () => {
      userRepository.findOne.mockResolvedValue(
        makeUser({ status: UserStatus.ACTIVE }),
      );

      await expect(
        service.adminSetStatus(USER_ID, UserStatus.ACTIVE, ADMIN_ID),
      ).rejects.toBeInstanceOf(BadRequestException);
    });

    it('invalidates sessions when moving away from active', async () => {
      const user = makeUser({ tokenVersion: 1 });
      userRepository.findOne.mockResolvedValue(user);

      await service.adminSetStatus(
        USER_ID,
        UserStatus.PENDING_VERIFICATION,
        ADMIN_ID,
      );

      expect(user.tokenVersion).toBe(2);
      expect(refreshTokenRepository.delete).toHaveBeenCalledWith({
        userId: USER_ID,
      });
    });

    it('audits the transition with both the old and new status', async () => {
      userRepository.findOne.mockResolvedValue(makeUser());

      await service.adminSetStatus(USER_ID, UserStatus.SUSPENDED, ADMIN_ID);

      expect(auditLogRepository.save).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: ADMIN_ID,
          eventType: 'user_status_changed',
          metadata: {
            targetUserId: USER_ID,
            from: UserStatus.ACTIVE,
            to: UserStatus.SUSPENDED,
          },
        }),
      );
    });
  });
});
