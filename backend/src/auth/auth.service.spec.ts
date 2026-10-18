import { UnauthorizedException } from '@nestjs/common';
import { AuditEvent } from '../audit/entities/audit-log.entity';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';

const WALLET = 'G' + 'A'.repeat(55);

function makeUser() {
  return {
    id: 'u1',
    walletAddress: WALLET,
    tokenVersion: 0,
    roles: [],
    lastLoginAt: null as Date | null,
  };
}

function createService() {
  const users = {
    findOrCreateByWallet: jest.fn(),
    recordLogin: jest.fn(),
  };
  const nonces = { issue: jest.fn(), consume: jest.fn() };
  const signatures = { verify: jest.fn() };
  const refresh = { issuePair: jest.fn(), rotate: jest.fn() };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const service = new AuthService(
    users as never,
    nonces as never,
    signatures as never,
    refresh as never,
    audit as never,
  );
  return { service, users, nonces, signatures, refresh, audit };
}

const loginDto = (overrides: Partial<LoginDto> = {}): LoginDto => ({
  walletAddress: WALLET,
  nonce: 'n'.repeat(64),
  signature: 'c2lnbmF0dXJl',
  ...overrides,
});

const device = { userAgent: 'jest', ipAddress: '127.0.0.1' };

describe('AuthService', () => {
  it('delegates nonce issuance', async () => {
    const { service, nonces } = createService();
    nonces.issue.mockResolvedValue({ nonce: 'abc' });
    await expect(service.requestNonce(WALLET)).resolves.toEqual({ nonce: 'abc' });
    expect(nonces.issue).toHaveBeenCalledWith(WALLET);
  });

  it('logs in a wallet and records a success audit entry', async () => {
    const { service, users, nonces, signatures, refresh, audit } = createService();
    const user = makeUser();
    const pair = { accessToken: 'a', refreshToken: 'r', expiresIn: 900 };
    users.findOrCreateByWallet.mockResolvedValue(user);
    users.recordLogin.mockResolvedValue(user);
    refresh.issuePair.mockResolvedValue(pair);

    const result = await service.login(loginDto({ walletAddress: WALLET.toLowerCase() }), device);

    expect(result).toBe(pair);
    expect(nonces.consume).toHaveBeenCalledWith(WALLET, 'n'.repeat(64));
    expect(signatures.verify).toHaveBeenCalledWith(WALLET, 'n'.repeat(64), 'c2lnbmF0dXJl');
    expect(users.findOrCreateByWallet).toHaveBeenCalledWith({ walletAddress: WALLET });
    expect(users.recordLogin).toHaveBeenCalledWith('u1');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        event: AuditEvent.LOGIN_SUCCESS,
        userId: 'u1',
        walletAddress: WALLET,
      }),
    );
  });

  it('records a failure audit entry when the signature is rejected', async () => {
    const { service, users, nonces, signatures, refresh, audit } = createService();
    nonces.consume.mockResolvedValue(undefined);
    signatures.verify.mockImplementation(() => {
      throw new UnauthorizedException('Invalid signature');
    });

    await expect(service.login(loginDto(), device)).rejects.toThrow('Invalid signature');

    expect(users.findOrCreateByWallet).not.toHaveBeenCalled();
    expect(refresh.issuePair).not.toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        event: AuditEvent.LOGIN_FAILURE,
        walletAddress: WALLET,
        metadata: { reason: 'Invalid signature' },
      }),
    );
  });

  it('records a failure audit entry when the nonce is invalid', async () => {
    const { service, nonces, audit } = createService();
    nonces.consume.mockRejectedValue(new UnauthorizedException('Invalid or expired nonce'));

    await expect(service.login(loginDto(), device)).rejects.toThrow('Invalid or expired nonce');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ event: AuditEvent.LOGIN_FAILURE }),
    );
  });

  it('delegates refresh token rotation', async () => {
    const { service, refresh } = createService();
    const pair = { accessToken: 'a', refreshToken: 'r', expiresIn: 900 };
    refresh.rotate.mockResolvedValue(pair);
    await expect(service.refreshTokens('raw', device)).resolves.toBe(pair);
    expect(refresh.rotate).toHaveBeenCalledWith('raw', device);
  });
});
