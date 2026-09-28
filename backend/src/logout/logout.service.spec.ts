import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { LogoutService } from './logout.service';
import { TokenBlacklistService } from '../security/token-blacklist.service';
import { AuditService } from '../audit/audit.service';
import { RefreshToken } from '../auth/entities/refresh-token.entity';
import { User } from '../user/entities/user.entity';

describe('LogoutService (#1317)', () => {
  let service: LogoutService;
  let refreshTokens: any;
  let users: any;
  let blacklist: { blacklistToken: ReturnType<typeof vi.fn> };
  let audit: any;

  const accessToken = 'header.payload.signature';

  beforeEach(async () => {
    refreshTokens = {
      find: vi.fn().mockResolvedValue([]),
      findOne: vi.fn().mockResolvedValue(null),
      delete: vi.fn().mockResolvedValue({ affected: 1 }),
    };
    users = {
      findOne: vi.fn().mockResolvedValue({ id: 'user-1', tokenVersion: 4 }),
      createQueryBuilder: vi.fn(() => ({
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockReturnThis(),
        execute: vi.fn().mockResolvedValue({ affected: 1 }),
      })),
    };
    blacklist = { blacklistToken: vi.fn().mockResolvedValue(900) };
    audit = { logLogout: vi.fn().mockResolvedValue(undefined) };

    const module = await Test.createTestingModule({
      providers: [
        LogoutService,
        { provide: getRepositoryToken(RefreshToken), useValue: refreshTokens },
        { provide: getRepositoryToken(User), useValue: users },
        { provide: TokenBlacklistService, useValue: blacklist },
        { provide: AuditService, useValue: audit },
      ],
    }).compile();

    service = module.get(LogoutService);
  });

  describe('logout()', () => {
    it('still revokes the session when the bearer header is missing', async () => {
      refreshTokens.findOne.mockResolvedValueOnce({ id: 'refresh-9' });

      const result = await service.logout({ userId: 'user-1' });

      expect(blacklist.blacklistToken).toHaveBeenCalledWith(null);
      expect(result.blacklistedForSeconds).toBe(900);
      expect(result.refreshTokenRevoked).toBe(true);
    });

    it('blacklists the presented access token', async () => {
      refreshTokens.findOne.mockResolvedValueOnce({ id: 'refresh-9' });

      const result = await service.logout({ userId: 'user-1', accessToken });

      expect(blacklist.blacklistToken).toHaveBeenCalledWith(accessToken);
      expect(result).toMatchObject({
        success: true,
        blacklistedForSeconds: 900,
        refreshTokenRevoked: true,
      });
    });

    it('audits the logout with the session scope', async () => {
      await service.logout({ userId: 'user-1', accessToken, ipAddress: '203.0.113.5' });

      expect(audit.logLogout).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'user-1', scope: 'session', ipAddress: '203.0.113.5' }),
      );
    });

    it('revokes only the supplied refresh token, scoped to the caller', async () => {
      await service.logout({ userId: 'user-1', accessToken, refreshToken: 'refresh-1' });

      expect(refreshTokens.delete).toHaveBeenCalledWith({
        token: 'refresh-1',
        userId: 'user-1',
      });
    });

    it('never revokes a refresh token belonging to somebody else', async () => {
      refreshTokens.delete.mockResolvedValueOnce({ affected: 0 });

      const result = await service.logout({
        userId: 'user-1',
        accessToken,
        refreshToken: 'someone-elses-token',
      });

      expect(result.refreshTokenRevoked).toBe(false);
      expect(refreshTokens.findOne).not.toHaveBeenCalled();
    });

    it('falls back to the newest active session when no token is supplied', async () => {
      refreshTokens.findOne.mockResolvedValueOnce({ id: 'refresh-9' });

      const result = await service.logout({ userId: 'user-1', accessToken });

      expect(refreshTokens.findOne).toHaveBeenCalledWith({
        where: { userId: 'user-1', isRevoked: false },
        order: { createdAt: 'DESC' },
      });
      expect(refreshTokens.delete).toHaveBeenCalledWith({ id: 'refresh-9' });
      expect(result.refreshTokenRevoked).toBe(true);
    });

    it('reports no revocation when the user has no active session', async () => {
      refreshTokens.findOne.mockResolvedValueOnce(null);
      refreshTokens.delete.mockResolvedValueOnce({ affected: 1 });

      const result = await service.logout({ userId: 'user-1', accessToken });

      expect(result.refreshTokenRevoked).toBe(false);
    });
  });

  describe('logoutAll()', () => {
    it('deletes every refresh token of the user', async () => {
      refreshTokens.find.mockResolvedValue([{ id: 'r1' }, { id: 'r2' }, { id: 'r3' }]);

      const result = await service.logoutAll({ userId: 'user-1' });

      expect(refreshTokens.delete).toHaveBeenCalledWith({ userId: 'user-1' });
      expect(result.revokedSessionsCount).toBe(3);
    });

    it('bumps tokenVersion so every issued access token becomes invalid', async () => {
      users.findOne.mockResolvedValueOnce({ id: 'user-1', tokenVersion: 4 });

      const result = await service.logoutAll({ userId: 'user-1' });

      expect(result.tokenVersion).toBe(5);
    });

    it('treats a missing user row as version 0', async () => {
      users.findOne.mockResolvedValueOnce(null);

      const result = await service.logoutAll({ userId: 'ghost' });

      expect(result.tokenVersion).toBe(1);
    });

    it('skips the delete when there is nothing to revoke', async () => {
      refreshTokens.find.mockResolvedValue([]);

      const result = await service.logoutAll({ userId: 'user-1' });

      expect(refreshTokens.delete).not.toHaveBeenCalled();
      expect(result.revokedSessionsCount).toBe(0);
    });

    it('audits the logout with the "all" scope', async () => {
      await service.logoutAll({ userId: 'user-1', walletAddress: 'GADMIN' });

      expect(audit.logLogout).toHaveBeenCalledWith(
        expect.objectContaining({ scope: 'all', blacklistedToken: true }),
      );
    });
  });
});
