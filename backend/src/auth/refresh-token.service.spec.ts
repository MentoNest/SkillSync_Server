import { UnauthorizedException } from '@nestjs/common';
import { RefreshTokenService } from './refresh-token.service';

const user = { id: 'u1', walletAddress: 'G' + 'A'.repeat(55), tokenVersion: 0 };
const device = { userAgent: 'jest', ipAddress: '127.0.0.1' };

function createService() {
  const tokens = { create: jest.fn((input: Record<string, unknown>) => input), save: jest.fn(async (e: unknown) => e), findOne: jest.fn(), update: jest.fn() };
  const users = { findOne: jest.fn() };
  const tokenService = {
    signAccessToken: jest.fn().mockResolvedValue('signed-access'),
    accessTtlSeconds: 900,
  };
  const config = { get: jest.fn(() => '7') };
  const service = new RefreshTokenService(
    tokens as never,
    users as never,
    tokenService as never,
    config as never,
  );
  return { service, tokens, users, tokenService };
}

describe('RefreshTokenService', () => {
  it('issues a token pair and stores only the hash', async () => {
    const { service, tokens } = createService();
    const pair = await service.issuePair(user as never, device);
    expect(pair.accessToken).toBe('signed-access');
    expect(pair.expiresIn).toBe(900);
    expect(pair.refreshToken).toEqual(expect.any(String));
    expect(tokens.create).toHaveBeenCalledWith(
      expect.objectContaining({
        userId: 'u1',
        tokenHash: expect.stringMatching(/^[0-9a-f]{64}$/),
        familyId: expect.any(String),
        userAgent: 'jest',
        ipAddress: '127.0.0.1',
        revokedAt: null,
      }),
    );
    expect(pair.refreshToken).not.toEqual(expect.stringMatching(/^[0-9a-f]{64}$/));
  });

  it('rejects an unknown refresh token', async () => {
    const { service, tokens } = createService();
    tokens.findOne.mockResolvedValue(null);
    await expect(service.rotate('raw', device)).rejects.toThrow(UnauthorizedException);
  });

  it('revokes the whole family when an already-rotated token is reused', async () => {
    const { service, tokens } = createService();
    tokens.findOne.mockResolvedValue({
      tokenHash: 'h',
      familyId: 'fam-1',
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      userId: 'u1',
    });
    await expect(service.rotate('raw', device)).rejects.toThrow('Refresh token reuse detected');
    expect(tokens.update).toHaveBeenCalledWith(
      { familyId: 'fam-1', revokedAt: expect.anything() },
      { revokedAt: expect.any(Date) },
    );
  });

  it('rejects an expired refresh token', async () => {
    const { service, tokens } = createService();
    tokens.findOne.mockResolvedValue({
      tokenHash: 'h',
      familyId: 'fam-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1000),
      userId: 'u1',
    });
    await expect(service.rotate('raw', device)).rejects.toThrow('Refresh token expired');
  });

  it('rejects a refresh token whose user no longer exists', async () => {
    const { service, tokens, users } = createService();
    tokens.findOne.mockResolvedValue({
      tokenHash: 'h',
      familyId: 'fam-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      userId: 'gone',
    });
    users.findOne.mockResolvedValue(null);
    await expect(service.rotate('raw', device)).rejects.toThrow('Invalid refresh token');
  });

  it('rotates a valid token within the same family', async () => {
    const { service, tokens, users } = createService();
    tokens.findOne.mockResolvedValue({
      tokenHash: 'h',
      familyId: 'fam-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      userId: 'u1',
    });
    users.findOne.mockResolvedValue(user);
    const pair = await service.rotate('raw', device);
    expect(tokens.save).toHaveBeenCalled();
    expect(pair.accessToken).toBe('signed-access');
    const created = tokens.create.mock.calls[0][0] as { familyId: string };
    expect(created.familyId).toBe('fam-1');
  });
});
