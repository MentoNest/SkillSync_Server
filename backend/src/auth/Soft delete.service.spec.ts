import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { SoftDeleteService } from './soft-delete.service';

// ─── Helpers ──────────────────────────────────────────────────────────────────

const mockAudit = {
  userId: 'admin-1',
  ipAddress: '127.0.0.1',
  userAgent: 'jest',
  deviceFingerprint: null,
};

function makeUser(overrides = {}) {
  return {
    id: 'user-1',
    walletAddress: 'GABC123',
    email: 'alice@example.com',
    username: 'alice',
    status: 'active',
    deletedAt: null,
    roles: [],
    tokenVersion: 0,
    ...overrides,
  };
}

function makeService(userOverrides = {}, configOverrides = {}) {
  const user = makeUser(userOverrides);

  const userRepository = {
    findOne: jest.fn().mockResolvedValue(user),
    find: jest.fn().mockResolvedValue([]),
    createQueryBuilder: jest.fn().mockReturnValue({
      withDeleted: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      skip: jest.fn().mockReturnThis(),
      take: jest.fn().mockReturnThis(),
      getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
    }),
  };

  const refreshTokenRepository = {};

  const manager = {
    update: jest.fn().mockResolvedValue({ affected: 1 }),
    delete: jest.fn().mockResolvedValue({ affected: 1 }),
    createQueryBuilder: jest.fn().mockReturnValue({
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue({ affected: 1 }),
    }),
  };

  const dataSource = {
    transaction: jest.fn().mockImplementation((cb) => cb(manager)),
  };

  const configService = {
    get: jest.fn().mockImplementation((key) => {
      if (key === 'DELETE_GRACE_DAYS') return configOverrides['DELETE_GRACE_DAYS'] ?? '30';
      return null;
    }),
  };

  const auditLogService = {
    logPasswordEquivalentChange: jest.fn().mockResolvedValue(undefined),
  };

  const service = new SoftDeleteService(
    userRepository as any,
    refreshTokenRepository as any,
    dataSource as any,
    configService as any,
    auditLogService as any,
  );

  return { service, userRepository, manager, dataSource, auditLogService, user };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

describe('SoftDeleteService', () => {

  // ─── Grace period config ───────────────────────────────────────────────────

  describe('graceDays', () => {
    it('defaults to 30 when DELETE_GRACE_DAYS is not set', () => {
      const { service } = makeService({}, { DELETE_GRACE_DAYS: undefined });
      expect(service.graceDays).toBe(30);
    });

    it('reads DELETE_GRACE_DAYS from config', () => {
      const { service } = makeService({}, { DELETE_GRACE_DAYS: '14' });
      expect(service.graceDays).toBe(14);
    });

    it('defaults to 30 for non-numeric DELETE_GRACE_DAYS', () => {
      const { service } = makeService({}, { DELETE_GRACE_DAYS: 'invalid' });
      expect(service.graceDays).toBe(30);
    });

    it('defaults to 30 for zero DELETE_GRACE_DAYS', () => {
      const { service } = makeService({}, { DELETE_GRACE_DAYS: '0' });
      expect(service.graceDays).toBe(30);
    });
  });

  // ─── Soft delete ───────────────────────────────────────────────────────────

  describe('softDeleteUser', () => {
    it('soft-deletes an active user and returns result shape', async () => {
      const { service } = makeService();
      const result = await service.softDeleteUser('user-1', mockAudit);

      expect(result.deletedAt).toBeInstanceOf(Date);
      expect(result.reactivationDeadline).toBeInstanceOf(Date);
      expect(result.graceDays).toBe(30);
      expect(result.message).toMatch(/reactivate/i);
    });

    it('sets reactivationDeadline exactly graceDays after deletedAt', async () => {
      const { service } = makeService();
      const result = await service.softDeleteUser('user-1', mockAudit);

      const diff = result.reactivationDeadline.getTime() - result.deletedAt.getTime();
      const expectedMs = 30 * 24 * 60 * 60 * 1000;
      expect(diff).toBe(expectedMs);
    });

    it('runs inside a transaction', async () => {
      const { service, dataSource } = makeService();
      await service.softDeleteUser('user-1', mockAudit);
      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    });

    it('revokes all active refresh tokens inside the transaction', async () => {
      const { service, manager } = makeService();
      await service.softDeleteUser('user-1', mockAudit);

      expect(manager.update).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ userId: 'user-1', revokedAt: null }),
        expect.objectContaining({ revokedAt: expect.any(Date) }),
      );
    });

    it('throws NotFoundException when user does not exist', async () => {
      const { service, userRepository } = makeService();
      userRepository.findOne.mockResolvedValue(null);

      await expect(service.softDeleteUser('ghost', mockAudit))
        .rejects.toThrow(NotFoundException);
    });

    it('throws ForbiddenException if account is already soft-deleted', async () => {
      const { service } = makeService({ deletedAt: new Date() });

      await expect(service.softDeleteUser('user-1', mockAudit))
        .rejects.toThrow(ForbiddenException);
    });

    it('writes an audit log entry on successful delete', async () => {
      const { service, auditLogService } = makeService();
      await service.softDeleteUser('user-1', mockAudit);

      expect(auditLogService.logPasswordEquivalentChange).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: 'user-1',
          details: expect.objectContaining({ reason: 'soft_delete' }),
        }),
      );
    });
  });

  // ─── Restore ───────────────────────────────────────────────────────────────

  describe('restoreUser', () => {
    it('restores a soft-deleted account within the grace period', async () => {
      const recentDelete = new Date();
      recentDelete.setDate(recentDelete.getDate() - 5); // 5 days ago, within 30-day grace

      const { service } = makeService({ deletedAt: recentDelete });
      const result = await service.restoreUser('user-1', mockAudit);

      expect(result.restoredAt).toBeInstanceOf(Date);
      expect(result.userId).toBe('user-1');
      expect(result.message).toMatch(/reactivated/i);
    });

    it('throws ForbiddenException when grace period has expired', async () => {
      const oldDelete = new Date();
      oldDelete.setDate(oldDelete.getDate() - 31); // 31 days ago, past 30-day grace

      const { service } = makeService({ deletedAt: oldDelete });

      await expect(service.restoreUser('user-1', mockAudit))
        .rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when account is not deleted', async () => {
      const { service } = makeService({ deletedAt: null });

      await expect(service.restoreUser('user-1', mockAudit))
        .rejects.toThrow(ForbiddenException);
    });

    it('throws NotFoundException when user does not exist', async () => {
      const { service, userRepository } = makeService();
      userRepository.findOne.mockResolvedValue(null);

      await expect(service.restoreUser('ghost', mockAudit))
        .rejects.toThrow(NotFoundException);
    });

    it('runs restore inside a transaction', async () => {
      const recentDelete = new Date();
      recentDelete.setDate(recentDelete.getDate() - 1);

      const { service, dataSource } = makeService({ deletedAt: recentDelete });
      await service.restoreUser('user-1', mockAudit);

      expect(dataSource.transaction).toHaveBeenCalledTimes(1);
    });

    it('writes an audit log on successful restore', async () => {
      const recentDelete = new Date();
      recentDelete.setDate(recentDelete.getDate() - 1);

      const { service, auditLogService } = makeService({ deletedAt: recentDelete });
      await service.restoreUser('user-1', mockAudit);

      expect(auditLogService.logPasswordEquivalentChange).toHaveBeenCalledWith(
        expect.objectContaining({
          details: expect.objectContaining({ reason: 'account_restored' }),
        }),
      );
    });
  });

  // ─── Login gate ────────────────────────────────────────────────────────────

  describe('assertNotSoftDeleted', () => {
    it('passes through for an active user', async () => {
      const { service } = makeService({ deletedAt: null });
      const user = makeUser({ deletedAt: null });

      await expect(service.assertNotSoftDeleted(user as any, mockAudit))
        .resolves.not.toThrow();
    });

    it('auto-restores and passes through when within grace period', async () => {
      const recentDelete = new Date();
      recentDelete.setDate(recentDelete.getDate() - 5);

      const { service } = makeService({ deletedAt: recentDelete });
      const user = makeUser({ deletedAt: recentDelete });

      await expect(service.assertNotSoftDeleted(user as any, mockAudit, true))
        .resolves.not.toThrow();
    });

    it('throws ForbiddenException when grace period expired', async () => {
      const oldDelete = new Date();
      oldDelete.setDate(oldDelete.getDate() - 31);

      const { service } = makeService({ deletedAt: oldDelete });
      const user = makeUser({ deletedAt: oldDelete });

      await expect(service.assertNotSoftDeleted(user as any, mockAudit))
        .rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException with reactivation instructions when autoRestore=false', async () => {
      const recentDelete = new Date();
      recentDelete.setDate(recentDelete.getDate() - 5);

      const { service } = makeService({ deletedAt: recentDelete });
      const user = makeUser({ deletedAt: recentDelete });

      await expect(service.assertNotSoftDeleted(user as any, mockAudit, false))
        .rejects.toThrow(ForbiddenException);
    });

    it('error message for soft-deleted user includes restore endpoint hint', async () => {
      const recentDelete = new Date();
      recentDelete.setDate(recentDelete.getDate() - 5);

      const { service } = makeService({ deletedAt: recentDelete });
      const user = makeUser({ deletedAt: recentDelete });

      try {
        await service.assertNotSoftDeleted(user as any, mockAudit, false);
        fail('Expected ForbiddenException');
      } catch (err) {
        expect(err.message).toMatch(/restore/i);
      }
    });
  });

  // ─── Permanent delete ──────────────────────────────────────────────────────

  describe('permanentlyDeleteUser', () => {
    it('anonymizes a soft-deleted user past grace period', async () => {
      const oldDelete = new Date();
      oldDelete.setDate(oldDelete.getDate() - 31);

      const { service } = makeService({ deletedAt: oldDelete });
      const result = await service.permanentlyDeleteUser('user-1', mockAudit);

      expect(result.anonymized).toBe(true);
      expect(result.userId).toBe('user-1');
    });

    it('throws ForbiddenException when user has not been soft-deleted and force=false', async () => {
      const { service } = makeService({ deletedAt: null });

      await expect(service.permanentlyDeleteUser('user-1', mockAudit))
        .rejects.toThrow(ForbiddenException);
    });

    it('throws ForbiddenException when still within grace period and force=false', async () => {
      const recentDelete = new Date();
      recentDelete.setDate(recentDelete.getDate() - 5);

      const { service } = makeService({ deletedAt: recentDelete });

      await expect(service.permanentlyDeleteUser('user-1', mockAudit))
        .rejects.toThrow(ForbiddenException);
    });

    it('bypasses grace period check when force=true', async () => {
      const recentDelete = new Date();
      recentDelete.setDate(recentDelete.getDate() - 1);

      const { service } = makeService({ deletedAt: recentDelete });

      await expect(
        service.permanentlyDeleteUser('user-1', mockAudit, { force: true }),
      ).resolves.not.toThrow();
    });

    it('performs hard delete when anonymize=false', async () => {
      const oldDelete = new Date();
      oldDelete.setDate(oldDelete.getDate() - 31);

      const { service, manager } = makeService({ deletedAt: oldDelete });
      const result = await service.permanentlyDeleteUser('user-1', mockAudit, {
        anonymize: false,
      });

      expect(result.anonymized).toBe(false);
      expect(manager.delete).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ userId: 'user-1' }),
      );
    });

    it('throws NotFoundException for a non-existent user', async () => {
      const { service, userRepository } = makeService();
      userRepository.findOne.mockResolvedValue(null);

      await expect(service.permanentlyDeleteUser('ghost', mockAudit))
        .rejects.toThrow(NotFoundException);
    });

    it('writes an audit log entry with admin userId', async () => {
      const oldDelete = new Date();
      oldDelete.setDate(oldDelete.getDate() - 31);

      const { service, auditLogService } = makeService({ deletedAt: oldDelete });
      await service.permanentlyDeleteUser('user-1', mockAudit);

      expect(auditLogService.logPasswordEquivalentChange).toHaveBeenCalledWith(
        expect.objectContaining({
          details: expect.objectContaining({ performedBy: 'admin-1' }),
        }),
      );
    });
  });

  // ─── Grace period cleanup ──────────────────────────────────────────────────

  describe('runGracePeriodCleanup', () => {
    it('returns zero processed when no expired users exist', async () => {
      const { service, userRepository } = makeService();
      userRepository.find.mockResolvedValue([]);

      const result = await service.runGracePeriodCleanup(mockAudit);
      expect(result.processed).toBe(0);
    });

    it('processes all expired soft-deleted users', async () => {
      const oldDelete = new Date();
      oldDelete.setDate(oldDelete.getDate() - 31);

      const expiredUsers = [
        makeUser({ id: 'user-1', deletedAt: oldDelete }),
        makeUser({ id: 'user-2', deletedAt: oldDelete }),
      ];

      const { service, userRepository } = makeService({ deletedAt: oldDelete });
      userRepository.find.mockResolvedValue(expiredUsers);
      // findOne needs to return a user for each permanent delete call
      userRepository.findOne
        .mockResolvedValueOnce(expiredUsers[0])
        .mockResolvedValueOnce(expiredUsers[1]);

      const result = await service.runGracePeriodCleanup(mockAudit);
      expect(result.processed).toBe(2);
    });

    it('continues processing remaining users if one fails', async () => {
      const oldDelete = new Date();
      oldDelete.setDate(oldDelete.getDate() - 31);

      const expiredUsers = [
        makeUser({ id: 'user-1', deletedAt: oldDelete }),
        makeUser({ id: 'user-2', deletedAt: oldDelete }),
      ];

      const { service, userRepository, dataSource } = makeService({ deletedAt: oldDelete });
      userRepository.find.mockResolvedValue(expiredUsers);
      userRepository.findOne
        .mockResolvedValueOnce(expiredUsers[0])
        .mockResolvedValueOnce(expiredUsers[1]);

      // First transaction fails, second succeeds
      dataSource.transaction
        .mockRejectedValueOnce(new Error('DB error'))
        .mockResolvedValueOnce(undefined);

      const result = await service.runGracePeriodCleanup(mockAudit);
      // One succeeded despite one failure
      expect(result.processed).toBe(1);
    });
  });

  // ─── listSoftDeletedUsers ──────────────────────────────────────────────────

  describe('listSoftDeletedUsers', () => {
    it('returns users and total from the repository', async () => {
      const deletedUser = makeUser({ deletedAt: new Date() });
      const { service, userRepository } = makeService();

      userRepository.createQueryBuilder.mockReturnValue({
        withDeleted: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[deletedUser], 1]),
      });

      const result = await service.listSoftDeletedUsers();
      expect(result.total).toBe(1);
      expect(result.users[0].id).toBe('user-1');
    });

    it('applies expiredOnly filter when requested', async () => {
      const { service, userRepository } = makeService();
      const andWhere = jest.fn().mockReturnThis();

      userRepository.createQueryBuilder.mockReturnValue({
        withDeleted: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        andWhere,
        skip: jest.fn().mockReturnThis(),
        take: jest.fn().mockReturnThis(),
        getManyAndCount: jest.fn().mockResolvedValue([[], 0]),
      });

      await service.listSoftDeletedUsers({ expiredOnly: true });
      expect(andWhere).toHaveBeenCalled();
    });
  });
});