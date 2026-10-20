import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import { AuditService } from './audit.service';
import { AuditEvent } from './entities/audit-log.entity';

// Test factory: builds an AuditService wired to a mocked repository and config,
// so no real database or environment is needed.
// `retentionDays` simulates the AUDIT_RETENTION_DAYS env var (undefined = unset).
function createService(options: { retentionDays?: string | undefined } = {}) {
  // Minimal stand-in for the TypeORM repository: only the methods the service uses
  const logs = {
    // create() just echoes its input, so assertions can inspect what was built
    create: jest.fn((v: unknown) => v),
    save: jest.fn().mockResolvedValue({ id: 'log-1' }),
    // Pretend 3 rows were deleted unless a test overrides it
    delete: jest.fn().mockResolvedValue({ affected: 3 }),
  };
  // Fake ConfigService that only knows about AUDIT_RETENTION_DAYS
  const config = {
    get: (key: string) => (key === 'AUDIT_RETENTION_DAYS' ? options.retentionDays : undefined),
  };
  // Double casts bypass full type checking of the partial mocks
  const service = new AuditService(logs as unknown as Repository<never>, config as unknown as ConfigService);
  return { service, logs };
}

describe('AuditService', () => {
  // Spies on the Nest Logger, kept so tests can assert on log output
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;
  let log: jest.SpyInstance;

  beforeEach(() => {
    // Silence logger output during tests (mockImplementation replaces the real call)
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  // Undo the spies after each test so they don't leak between tests
  afterEach(() => jest.restoreAllMocks());

  describe('record', () => {
    // Happy path: an entry is built and saved exactly once
    it('persists an audit entry', async () => {
      const { service, logs } = createService();

      await service.record({ event: AuditEvent.LOGIN_SUCCESS, userId: 'u1' });

      expect(logs.save).toHaveBeenCalledTimes(1);
      expect(logs.save).toHaveBeenCalledWith(
        expect.objectContaining({ event: AuditEvent.LOGIN_SUCCESS, userId: 'u1' }),
      );
    });

    // Only `event` is required; everything else gets a safe default
    it('defaults optional fields to null and metadata to an empty object', async () => {
      const { service, logs } = createService();

      await service.record({ event: AuditEvent.LOGOUT });

      expect(logs.save).toHaveBeenCalledWith(
        expect.objectContaining({
          walletAddress: null,
          ipAddress: null,
          userAgent: null,
          metadata: {},
        }),
      );
    });

    // Guards against a DB error: user agents longer than the column width are cut to 255 chars
    it('truncates an over-long user agent so the varchar(255) column cannot reject the row', async () => {
      const { service, logs } = createService();
      const longAgent = 'a'.repeat(400);

      await service.record({ event: AuditEvent.LOGIN_SUCCESS, userAgent: longAgent });

      expect(logs.save).toHaveBeenCalledWith(
        expect.objectContaining({ userAgent: 'a'.repeat(255) }),
      );
    });

    // Counterpart to the test above: normal-length values must pass through unchanged
    it('leaves a user agent that already fits untouched', async () => {
      const { service, logs } = createService();

      await service.record({ event: AuditEvent.LOGIN_SUCCESS, userAgent: 'Mozilla/5.0' });

      expect(logs.save).toHaveBeenCalledWith(expect.objectContaining({ userAgent: 'Mozilla/5.0' }));
    });

    // Free-form metadata is stored as given
    it('keeps arbitrary metadata', async () => {
      const { service, logs } = createService();

      await service.record({
        event: AuditEvent.ROLE_CHANGED,
        metadata: { from: 'mentee', to: 'mentor' },
      });

      expect(logs.save).toHaveBeenCalledWith(
        expect.objectContaining({ metadata: { from: 'mentee', to: 'mentor' } }),
      );
    });

    // Auditing is best-effort: a failed write is logged but never thrown to the caller
    it('swallows database errors so an audit failure cannot break the request', async () => {
      const { service, logs } = createService();
      // Make only the next save() call fail
      logs.save.mockRejectedValueOnce(new Error('connection terminated'));

      await expect(service.record({ event: AuditEvent.LOGIN_SUCCESS })).resolves.toBeUndefined();
      expect(error).toHaveBeenCalledWith('Failed to write audit log: connection terminated');
    });
  });

  describe('purgeExpired', () => {
    // Retention cleanup: deletes rows older than the cutoff and returns how many were removed
    it('deletes rows older than the retention window and reports the count', async () => {
      const { service, logs } = createService({ retentionDays: '90' });

      await expect(service.purgeExpired()).resolves.toBe(3);

      // Loose check that delete() received some criteria object
      expect(logs.delete).toHaveBeenCalledWith(expect.objectContaining({}));
      // The delete criteria is a TypeORM operator whose `.value` holds the cutoff Date
      const criteria = logs.delete.mock.calls[0][0] as Record<string, { value: Date }>;
      // Cutoff must be at least ~89 days ago (the 1-day margin absorbs timing differences)
      expect(criteria.createdAt.value.getTime()).toBeLessThan(Date.now() - 89 * 86_400_000);
    });

    // With AUDIT_RETENTION_DAYS unset, the cutoff should be about 90 days back
    it('defaults the retention window to 90 days when unset', async () => {
      const { service, logs } = createService();

      await service.purgeExpired();

      const criteria = logs.delete.mock.calls[0][0] as Record<string, { value: Date }>;
      // 86_400_000 ms = 1 day
      const ageInDays = (Date.now() - criteria.createdAt.value.getTime()) / 86_400_000;
      // Tolerance of +/- 0.1 day covers the time between purge and this check
      expect(ageInDays).toBeGreaterThan(89.9);
      expect(ageInDays).toBeLessThan(90.1);
    });

    // No matching rows: the service reports 0 rather than undefined/null
    it('returns 0 when nothing matched', async () => {
      const { service, logs } = createService();
      logs.delete.mockResolvedValue({ affected: 0 });

      await expect(service.purgeExpired()).resolves.toBe(0);
    });

    // The purge reports its size via the logger (uses the default mock of 3 rows)
    it('logs the purge size', async () => {
      const { service } = createService();
      await service.purgeExpired();
      expect(log).toHaveBeenCalledWith('Purged 3 audit logs older than 90 days');
    });
  });
});