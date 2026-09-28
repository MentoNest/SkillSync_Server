import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { AuditService } from './audit.service';
import { AuditEventType, AuditLog } from './entities/audit-log.entity';

describe('AuditService (#1320)', () => {
  let service: AuditService;
  let repository: any;
  let queryBuilder: any;

  beforeEach(async () => {
    queryBuilder = {
      where: vi.fn().mockReturnThis(),
      andWhere: vi.fn().mockReturnThis(),
      setParameter: vi.fn().mockReturnThis(),
      getCount: vi.fn().mockResolvedValue(0),
    };

    repository = {
      create: vi.fn((data: Partial<AuditLog>) => data as AuditLog),
      save: vi.fn(async (entity: AuditLog) => entity),
      find: vi.fn().mockResolvedValue([]),
      findOne: vi.fn().mockResolvedValue(null),
      findAndCount: vi.fn().mockResolvedValue([[], 0]),
      delete: vi.fn().mockResolvedValue({ affected: 0 }),
      createQueryBuilder: vi.fn(() => queryBuilder),
    };

    const module = await Test.createTestingModule({
      providers: [AuditService, { provide: getRepositoryToken(AuditLog), useValue: repository }],
    }).compile();

    service = module.get(AuditService);
  });

  describe('log()', () => {
    it('persists the event with ip, user agent and details', async () => {
      await service.log({
        eventType: AuditEventType.LOGIN_SUCCESS,
        userId: 'user-1',
        walletAddress: 'GABC',
        ipAddress: '203.0.113.10',
        userAgent: 'vitest',
        details: { network: 'testnet' },
      });

      expect(repository.save).toHaveBeenCalledTimes(1);
      const saved = repository.save.mock.calls[0][0];
      expect(saved).toMatchObject({
        eventType: AuditEventType.LOGIN_SUCCESS,
        userId: 'user-1',
        ipAddress: '203.0.113.10',
        userAgent: 'vitest',
        details: { network: 'testnet' },
        isSuspicious: false,
      });
    });

    it('never throws when the insert fails', async () => {
      repository.save.mockRejectedValueOnce(new Error('db down'));

      await expect(
        service.log({ eventType: AuditEventType.LOGOUT, userId: 'user-1' }),
      ).resolves.toBeNull();
    });
  });

  describe('logLoginFailure()', () => {
    it('records the attempted wallet address for unknown wallets', async () => {
      await service.logLoginFailure({
        attemptedWalletAddress: 'gattemptedwallet',
        ipAddress: '198.51.100.7',
        reason: 'INVALID_SIGNATURE',
      });

      const saved = repository.save.mock.calls[0][0];
      expect(saved.eventType).toBe(AuditEventType.LOGIN_FAILURE);
      expect(saved.walletAddress).toBe('gattemptedwallet');
      expect(saved.details).toMatchObject({ attemptedWalletAddress: 'gattemptedwallet' });
      expect(saved.suspiciousReason).toBe('INVALID_SIGNATURE');
    });

    it('derives the wallet from details when no column value is supplied', async () => {
      await service.log({
        eventType: AuditEventType.LOGIN_FAILURE,
        details: { attemptedWalletAddress: 'GFromDetails' },
      });

      expect(repository.save.mock.calls[0][0].walletAddress).toBe('GFromDetails');
    });

    it('flags the event as suspicious once the failure threshold is reached', async () => {
      queryBuilder.getCount.mockResolvedValue(2); // 2 stored + this one = 3

      await service.logLoginFailure({ attemptedWalletAddress: 'GW', reason: 'NONCE_MISMATCH' });

      expect(repository.save.mock.calls[0][0].isSuspicious).toBe(true);
    });

    it('does not flag isolated failures', async () => {
      queryBuilder.getCount.mockResolvedValue(0);

      await service.logLoginFailure({ attemptedWalletAddress: 'GW', reason: 'NONCE_MISMATCH' });

      expect(repository.save.mock.calls[0][0].isSuspicious).toBe(false);
    });
  });

  describe('logLogout() / logRoleChange() / logPasswordChange()', () => {
    it('uses the LOGOUT_ALL event type for a global logout', async () => {
      await service.logLogout({ userId: 'user-1', scope: 'all', revokedSessionsCount: 3 });

      const saved = repository.save.mock.calls[0][0];
      expect(saved.eventType).toBe(AuditEventType.LOGOUT_ALL);
      expect(saved.details).toMatchObject({ scope: 'all', revokedSessionsCount: 3 });
    });

    it('records who granted which role', async () => {
      await service.logRoleChange({
        targetUserId: 'user-2',
        actorId: 'admin-1',
        roleName: 'mentor',
        action: 'assigned',
        tokenVersion: 3,
      });

      expect(repository.save.mock.calls[0][0]).toMatchObject({
        eventType: AuditEventType.ROLE_ASSIGNED,
        userId: 'user-2',
        details: { actorId: 'admin-1', roleName: 'mentor', tokenVersion: 3 },
      });
    });

    it('distinguishes password resets from self-service changes', async () => {
      await service.logPasswordChange({ userId: 'user-1', kind: 'reset', performedBy: 'admin-1' });

      expect(repository.save.mock.calls[0][0].eventType).toBe(AuditEventType.PASSWORD_RESET);
    });
  });

  describe('getLogs()', () => {
    it('filters by event type, suspicious flag and paginates', async () => {
      repository.findAndCount.mockResolvedValue([[{ id: 'log-1' }], 1]);

      const page = await service.getLogs({
        userId: 'user-1',
        isSuspicious: true,
        eventType: AuditEventType.LOGIN_FAILURE,
        limit: 10,
        offset: 20,
      });

      expect(repository.findAndCount).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            userId: 'user-1',
            isSuspicious: true,
            eventType: AuditEventType.LOGIN_FAILURE,
          },
          take: 10,
          skip: 20,
        }),
      );
      expect(page.total).toBe(1);
    });

    it('clamps an unbounded limit', async () => {
      await service.getLogs({ limit: 10_000 });

      expect(repository.findAndCount.mock.calls[0][0].take).toBe(500);
    });

    it('supports filtering on several event types at once', async () => {
      await service.getLogs({ eventTypes: [AuditEventType.LOGIN_FAILURE, AuditEventType.LOGOUT] });

      const where = repository.findAndCount.mock.calls[0][0].where;
      expect(where.eventType).toBeDefined();
    });
  });

  describe('retention', () => {
    const originalEnv = process.env.AUDIT_LOG_RETENTION_DAYS;

    afterEach(() => {
      if (originalEnv === undefined) {
        delete process.env.AUDIT_LOG_RETENTION_DAYS;
      } else {
        process.env.AUDIT_LOG_RETENTION_DAYS = originalEnv;
      }
    });

    it('defaults to a 90 day retention window', () => {
      delete process.env.AUDIT_LOG_RETENTION_DAYS;
      expect(service.retentionDays).toBe(90);
    });

    it('honours AUDIT_LOG_RETENTION_DAYS', () => {
      process.env.AUDIT_LOG_RETENTION_DAYS = '7';
      expect(service.retentionDays).toBe(7);
    });

    it('deletes only rows older than the retention window', async () => {
      repository.delete.mockResolvedValue({ affected: 4 });

      const result = await service.cleanupOldLogs(30);

      expect(result.deletedCount).toBe(4);
      const cutoff = result.cutoff.getTime();
      const expected = Date.now() - 30 * 24 * 60 * 60 * 1000;
      expect(Math.abs(cutoff - expected)).toBeLessThan(5_000);
    });

    it('archiveAndCleanup returns the expired rows before purging them', async () => {
      repository.find.mockResolvedValue([{ id: 'old-1' }, { id: 'old-2' }]);
      repository.delete.mockResolvedValue({ affected: 2 });

      const result = await service.archiveAndCleanup(1);

      expect(result.archivedCount).toBe(2);
      expect(result.deletedCount).toBe(2);
      expect(result.archivedLogs).toHaveLength(2);
      expect(result.retentionDays).toBe(1);
    });

    it('scheduled cleanup swallows repository failures', async () => {
      repository.delete.mockRejectedValueOnce(new Error('db down'));

      await expect(service.runScheduledCleanup()).resolves.toBeNull();
    });
  });
});
