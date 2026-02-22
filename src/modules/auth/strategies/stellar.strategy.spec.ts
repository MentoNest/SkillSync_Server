import { Test, TestingModule } from '@nestjs/testing';
import { UnauthorizedException } from '@nestjs/common';
import { Keypair } from 'stellar-sdk';
import { StellarStrategy } from './stellar.strategy';
import { StellarNonceService } from '../providers/nonce.service';
import { UserService } from '../../user/providers/user.service';

function makeRequest(body: Record<string, unknown>) {
  return { body } as any;
}

function signNonce(keypair: Keypair, nonce: string): string {
  const buf = Buffer.from(nonce, 'utf8');
  return keypair.sign(buf).toString('base64');
}

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockUser = { id: 'user-1', publicKey: 'GXXX' };

const mockUsersService = {
  findOrCreateByPublicKey: jest.fn().mockResolvedValue(mockUser),
};

// ─── NonceService unit tests ──────────────────────────────────────────────────

describe('StellarNonceService', () => {
  let svc: StellarNonceService;

  beforeEach(() => { svc = new StellarNonceService(); });

  it('issues a hex nonce', () => {
    const payload = svc.issue('GPUB1');
    expect(payload.nonce).toMatch(/^[0-9a-f]{64}$/);
  });

  it('consume() returns true for correct nonce', () => {
    const payload = svc.issue('GPUB1');
    expect(svc.consume('GPUB1', payload.nonce)).toBe(true);
  });

  it('consume() returns false for wrong nonce', () => {
    svc.issue('GPUB1');
    expect(svc.consume('GPUB1', 'wrongnonce')).toBe(false);
  });

  it('consume() is one-time — second call returns false', () => {
    const payload = svc.issue('GPUB1');
    svc.consume('GPUB1', payload.nonce);
    expect(svc.consume('GPUB1', payload.nonce)).toBe(false);
  });

  it('consume() returns false for unknown publicKey', () => {
    expect(svc.consume('NOBODY', 'anynonce')).toBe(false);
  });

  it('consume() returns false after TTL expiry', () => {
    const payload = svc.issue('GPUB1');
    // Manually expire the entry
    jest.useFakeTimers();
    jest.advanceTimersByTime(6 * 60 * 1000); // 6 minutes
    expect(svc.consume('GPUB1', payload.nonce)).toBe(false);
    jest.useRealTimers();
  });
});

// ─── StellarStrategy unit tests ───────────────────────────────────────────────

describe('StellarStrategy', () => {
  let strategy: StellarStrategy;
  let nonceService: StellarNonceService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        StellarStrategy,
        StellarNonceService,
        { provide: UserService, useValue: mockUsersService },
      ],
    }).compile();

    strategy = module.get(StellarStrategy);
    nonceService = module.get(StellarNonceService);
    jest.clearAllMocks();
  });

  // ── Success path ───────────────────────────────────────────────────────────

  it('returns user context for a valid signature', async () => {
    const keypair = Keypair.random();
    const publicKey = keypair.publicKey();
    const payload = nonceService.issue(publicKey);
    const signature = signNonce(keypair, payload.nonce);

    const req = makeRequest({ publicKey, nonce: payload.nonce, signature });
    const result = await strategy.validate(req);

    expect(result).toEqual(mockUser);
    expect(mockUsersService.findOrCreateByPublicKey).toHaveBeenCalledWith(publicKey);
  });

  // ── Missing fields ─────────────────────────────────────────────────────────

  it('throws 401 when publicKey is missing', async () => {
    const req = makeRequest({ nonce: 'abc', signature: 'sig' });
    await expect(strategy.validate(req)).rejects.toThrow(UnauthorizedException);
  });

  it('throws 401 when nonce is missing', async () => {
    const req = makeRequest({ publicKey: 'GPUB', signature: 'sig' });
    await expect(strategy.validate(req)).rejects.toThrow(UnauthorizedException);
  });

  it('throws 401 when signature is missing', async () => {
    const req = makeRequest({ publicKey: 'GPUB', nonce: 'abc' });
    await expect(strategy.validate(req)).rejects.toThrow(UnauthorizedException);
  });

  // ── Invalid nonce ──────────────────────────────────────────────────────────

  it('throws 401 when nonce does not match server record', async () => {
    const keypair = Keypair.random();
    const publicKey = keypair.publicKey();
    nonceService.issue(publicKey); // issue but send wrong nonce
    const signature = signNonce(keypair, 'wrongnonce');

    const req = makeRequest({ publicKey, nonce: 'wrongnonce', signature });
    await expect(strategy.validate(req)).rejects.toThrow(UnauthorizedException);
  });

  it('throws 401 on replay (nonce already consumed)', async () => {
    const keypair = Keypair.random();
    const publicKey = keypair.publicKey();
    const payload = nonceService.issue(publicKey);
    const signature = signNonce(keypair, payload.nonce);

    const req = makeRequest({ publicKey, nonce: payload.nonce, signature });
    await strategy.validate(req); // first — succeeds

    // Re-issue the nonce so it passes nonce check but re-sign to isolate replay
    // Here we simulate the case where nonce is NOT re-issued (replay attack)
    nonceService.issue(publicKey); // new nonce issued, old one already deleted
    const req2 = makeRequest({ publicKey, nonce: payload.nonce, signature }); // old nonce
    await expect(strategy.validate(req2)).rejects.toThrow(UnauthorizedException);
  });

  // ── Invalid signature ──────────────────────────────────────────────────────

  it('throws 401 when signature is invalid (wrong key)', async () => {
    const keypair1 = Keypair.random();
    const keypair2 = Keypair.random(); // different key
    const publicKey = keypair1.publicKey();
    const payload = nonceService.issue(publicKey);
    const signature = signNonce(keypair2, payload.nonce); // signed by wrong key

    const req = makeRequest({ publicKey, nonce: payload.nonce, signature });
    await expect(strategy.validate(req)).rejects.toThrow(UnauthorizedException);
  });

  it('throws 401 when signature is tampered (wrong nonce signed)', async () => {
    const keypair = Keypair.random();
    const publicKey = keypair.publicKey();
    const payload = nonceService.issue(publicKey);
    const signature = signNonce(keypair, 'different-message'); // signed wrong content

    const req = makeRequest({ publicKey, nonce: payload.nonce, signature });
    await expect(strategy.validate(req)).rejects.toThrow(UnauthorizedException);
  });

  it('throws 401 when signature is not valid base64', async () => {
    const keypair = Keypair.random();
    const publicKey = keypair.publicKey();
    const payload = nonceService.issue(publicKey);

    const req = makeRequest({ publicKey, nonce: payload.nonce, signature: '!!!not-base64!!!' });
    await expect(strategy.validate(req)).rejects.toThrow(UnauthorizedException);
  });


  it('throws 401 for a malformed Stellar public key', async () => {
    const payload = nonceService.issue('BADKEY');
    const req = makeRequest({ publicKey: 'BADKEY', nonce: payload.nonce, signature: 'c2ln' });
    await expect(strategy.validate(req)).rejects.toThrow(UnauthorizedException);
  });
});