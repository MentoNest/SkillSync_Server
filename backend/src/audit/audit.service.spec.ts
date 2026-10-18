import { Logger } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import { AuditService } from './audit.service';
import { AuditEvent } from './entities/audit-log.entity';

function createService(options: { retentionDays?: string | undefined } = {}) {
  const logs = {
    create: jest.fn((v: unknown) => v),
    save: jest.fn().mockResolvedValue({ id: 'log-1' }),
    delete: jest.fn().mockResolvedValue({ affected: 3 }),
  };
  const config = {
    get: (key: string) => (key === 'AUDIT_RETENTION_DAYS' ? options.retentionDays : undefined),
  };
  const service = new AuditService(logs as unknown as Repository<never>, config as unknown as ConfigService);
  return { service, logs };
}

describe('AuditService', () => {
  let warn: jest.SpyInstance;
  let error: jest.SpyInstance;
  let log: jest.SpyInstance;

  beforeEach(() => {
    warn = jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    log = jest.spyOn(Logger.prototype, 'log').mockImplementation(() => undefined);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('record', () => {
    it('persists an audit entry', async () => {
      const { service, logs } = createService();

      await service.record({ event: AuditEvent.LOGIN_SUCCESS, userId: 'u1' });

      expect(logs.save).toHaveBeenCalledTimes(1);
      expect(logs.save).toHaveBeenCalledWith(
        expect.objectContaining({ event: AuditEvent.LOGIN_SUCCESS, userId: 'u1' }),
      );
    });

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

    it('truncates an over-long user agent so the varchar(255) column cannot reject the row', async () => {
      const { service, logs } = createService();
      const longAgent = 'a'.repeat(400);

      await service.record({ event: AuditEvent.LOGIN_SUCCESS, userAgent: longAgent });

      expect(logs.save).toHaveBeenCalledWith(
        expect.objectContaining({ userAgent: 'a'.repeat(255) }),
      );
    });

    it('leaves a user agent that already fits untouched', async () => {
      const { service, logs } = createService();

      await service.record({ event: AuditEvent.LOGIN_SUCCESS, userAgent: 'Mozilla/5.0' });

      expect(logs.save).toHaveBeenCalledWith(expect.objectContaining({ userAgent: 'Mozilla/5.0' }));
    });

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

    it('swallows database errors so an audit failure cannot break the request', async () => {
      const { service, logs } = createService();
      logs.save.mockRejectedValueOnce(new Error('connection terminated'));

      await expect(service.record({ event: AuditEvent.LOGIN_SUCCESS })).resolves.toBeUndefined();
      expect(error).toHaveBeenCalledWith('Failed to write audit log: connection terminated');
    });
  });

  describe('purgeExpired', () => {
    it('deletes rows older than the retention window and reports the count', async () => {
      const { service, logs } = createService({ retentionDays: '90' });

      await expect(service.purgeExpired()).resolves.toBe(3);

      expect(logs.delete).toHaveBeenCalledWith(expect.objectContaining({}));
      const criteria = logs.delete.mock.calls[0][0] as Record<string, { value: Date }>;
      expect(criteria.createdAt.value.getTime()).toBeLessThan(Date.now() - 89 * 86_400_000);
    });

    it('defaults the retention window to 90 days when unset', async () => {
      const { service, logs } = createService();

      await service.purgeExpired();

      const criteria = logs.delete.mock.calls[0][0] as Record<string, { value: Date }>;
      const ageInDays = (Date.now() - criteria.createdAt.value.getTime()) / 86_400_000;
      expect(ageInDays).toBeGreaterThan(89.9);
      expect(ageInDays).toBeLessThan(90.1);
    });

    it('returns 0 when nothing matched', async () => {
      const { service, logs } = createService();
      logs.delete.mockResolvedValue({ affected: 0 });

      await expect(service.purgeExpired()).resolves.toBe(0);
    });

    it('logs the purge size', async () => {
      const { service } = createService();
      await service.purgeExpired();
      expect(log).toHaveBeenCalledWith('Purged 3 audit logs older than 90 days');
    });
  });
});