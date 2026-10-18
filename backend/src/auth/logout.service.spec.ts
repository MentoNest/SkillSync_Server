import { createHash } from 'crypto';
import type { Repository } from 'typeorm';
import type { AuditService } from '../audit/audit.service';
import { AuditEvent } from '../audit/entities/audit-log.entity';
import type { RefreshToken } from './entities/refresh-token.entity';
import { LogoutService } from './logout.service';
import type { TokenBlacklistService } from './token-blacklist.service';

const USER = 'user-1';
const RAW_REFRESH = 'raw-refresh-token';

function createService(existingRow: Partial<RefreshToken> | null = { familyId: 'family-1' }) {
  const refreshTokens = {
    findOne: jest.fn().mockResolvedValue(existingRow),
    update: jest.fn().mockResolvedValue({ affected: 1 }),
  };
  const blacklist = { blacklist: jest.fn().mockResolvedValue(undefined) };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };

  const service = new LogoutService(
    refreshTokens as unknown as Repository<RefreshToken>,
    blacklist as unknown as TokenBlacklistService,
    audit as unknown as AuditService,
  );
  return { service, refreshTokens, blacklist, audit };
}

describe('LogoutService', () => {
  const hash = createHash('sha256').update(RAW_REFRESH).digest('hex');

  describe('logout', () => {
    it('blacklists the access token', async () => {
      const { service, blacklist } = createService();

      await service.logout({ userId: USER, jti: 'jti-1', exp: 123 });

      expect(blacklist.blacklist).toHaveBeenCalledWith('jti-1', 123);
    });

    it('revokes the whole refresh-token family when a refresh token is supplied', async () => {
      const { service, refreshTokens } = createService();

      await service.logout({ userId: USER, jti: 'jti-1', exp: 123, refreshToken: RAW_REFRESH });

      expect(refreshTokens.findOne).toHaveBeenCalledWith({
        where: { tokenHash: hash, userId: USER },
      });
      expect(refreshTokens.update).toHaveBeenCalledWith(
        { familyId: 'family-1', revokedAt: expect.anything() },
        { revokedAt: expect.any(Date) },
      );
    });

    it('skips the refresh-token lookup when no refresh token is supplied', async () => {
      const { service, refreshTokens } = createService();

      await service.logout({ userId: USER, jti: 'jti-1', exp: 123 });

      expect(refreshTokens.findOne).not.toHaveBeenCalled();
      expect(refreshTokens.update).not.toHaveBeenCalled();
    });

    it('still records the logout when the refresh token row is already gone', async () => {
      const { service, refreshTokens, audit } = createService(null);

      await service.logout({ userId: USER, jti: 'jti-1', exp: 123, refreshToken: RAW_REFRESH });

      expect(refreshTokens.update).not.toHaveBeenCalled();
      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ event: AuditEvent.LOGOUT, userId: USER }),
      );
    });

    it('writes an audit entry carrying the request fingerprint', async () => {
      const { service, audit } = createService();

      await service.logout({
        userId: USER,
        jti: 'jti-1',
        exp: 123,
        ipAddress: '203.0.113.9',
        userAgent: 'Mozilla/5.0',
      });

      expect(audit.record).toHaveBeenCalledWith({
        event: AuditEvent.LOGOUT,
        userId: USER,
        ipAddress: '203.0.113.9',
        userAgent: 'Mozilla/5.0',
      });
    });

    it('allows undefined fingerprint fields through to the audit log', async () => {
      const { service, audit } = createService();

      await service.logout({ userId: USER, jti: 'jti-1', exp: 123 });

      expect(audit.record).toHaveBeenCalledWith(
        expect.objectContaining({ ipAddress: undefined, userAgent: undefined }),
      );
    });

    it('looks the refresh token up by sha256 hash, never by the raw value', async () => {
      const { service, refreshTokens } = createService();

      await service.logout({ userId: USER, jti: 'jti-1', exp: 123, refreshToken: RAW_REFRESH });

      const where = refreshTokens.findOne.mock.calls[0][0].where as { tokenHash: string };
      expect(where.tokenHash).toBe(hash);
      expect(where.tokenHash).not.toBe(RAW_REFRESH);
    });
  });
});