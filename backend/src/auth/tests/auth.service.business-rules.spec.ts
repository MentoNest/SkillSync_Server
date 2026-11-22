import { JwtService } from '@nestjs/jwt';
import { Keypair } from '@stellar/stellar-sdk';
import {
  InvalidCredentialsException,
  TokenExpiredException,
} from '../../common/errors/app-exceptions';
import { RedisNamespace } from '../../redis/redis.config';
import { AuthService, loginMessage } from '../auth.service';
import { AuthConfig, Role } from '../auth.types';

/** RedisService stub with a controllable clock so nonce expiry is deterministic. */
class TtlRedis {
  now = Date.now();
  readonly store = new Map<string, { value: string; expiresAt?: number }>();
  private key = (ns: RedisNamespace, key: string) => `${ns}:${key}`;

  async get(ns: RedisNamespace, key: string): Promise<string | null> {
    const entry = this.store.get(this.key(ns, key));
    if (!entry) return null;
    if (entry.expiresAt !== undefined && this.now >= entry.expiresAt) {
      this.store.delete(this.key(ns, key));
      return null;
    }
    return entry.value;
  }

  async set(ns: RedisNamespace, key: string, value: string, ttlSeconds?: number): Promise<void> {
    this.store.set(this.key(ns, key), {
      value,
      expiresAt: ttlSeconds ? this.now + ttlSeconds * 1000 : undefined,
    });
  }

  async del(ns: RedisNamespace, key: string): Promise<number> {
    return this.store.delete(this.key(ns, key)) ? 1 : 0;
  }

  async exists(ns: RedisNamespace, key: string): Promise<boolean> {
    return (await this.get(ns, key)) !== null;
  }
}

const config = (over: Partial<AuthConfig> = {}): AuthConfig => ({
  jwtSecret: 'business-rules-test-secret-at-least-32',
  accessTtlSeconds: 900,
  refreshTtlSeconds: 3600,
  nonceTtlSeconds: 1,
  adminAddresses: [],
  mentorAddresses: [],
  ...over,
});

function sign(kp: Keypair, nonce: string): string {
  return kp.sign(Buffer.from(loginMessage(kp.publicKey(), nonce), 'utf8')).toString('base64');
}

describe('AuthService business rules', () => {
  const kp = Keypair.random();

  it('issues the exact message the wallet must sign and consumes the nonce once', async () => {
    const redis = new TtlRedis();
    const service = new AuthService(new JwtService(), redis as never, config());

    const issued = await service.createNonce(kp.publicKey());
    expect(issued.message).toBe(loginMessage(kp.publicKey(), issued.nonce));
    await expect(service.login(kp.publicKey(), sign(kp, issued.nonce))).resolves.toBeDefined();

    // The nonce is single-use, so the same signature cannot be replayed.
    await expect(service.login(kp.publicKey(), sign(kp, issued.nonce))).rejects.toBeInstanceOf(
      InvalidCredentialsException,
    );
  });

  it('rejects an expired nonce with INVALID_CREDENTIALS', async () => {
    const redis = new TtlRedis();
    const service = new AuthService(new JwtService(), redis as never, config());
    const { nonce } = await service.createNonce(kp.publicKey());
    redis.now += 1_001;

    await expect(service.login(kp.publicKey(), sign(kp, nonce))).rejects.toBeInstanceOf(
      InvalidCredentialsException,
    );
  });

  it('rejects signatures from a different key', async () => {
    const redis = new TtlRedis();
    const service = new AuthService(new JwtService(), redis as never, config());
    const { nonce } = await service.createNonce(kp.publicKey());
    const forged = Keypair.random().sign(Buffer.from(loginMessage(kp.publicKey(), nonce))).toString('base64');

    await expect(service.login(kp.publicKey(), forged)).rejects.toBeInstanceOf(
      InvalidCredentialsException,
    );
  });

  it('assigns mentor and admin roles from configured addresses only', () => {
    const address = kp.publicKey();
    const service = new AuthService(
      new JwtService(),
      new TtlRedis() as never,
      config({ adminAddresses: [address], mentorAddresses: [address] }),
    );
    expect(service.rolesFor(address)).toEqual([Role.USER, Role.MENTOR, Role.ADMIN]);
    expect(service.rolesFor(Keypair.random().publicKey())).toEqual([Role.USER]);
  });

  it('rejects expired and wrong-type refresh tokens', async () => {
    const jwt = new JwtService();
    const service = new AuthService(jwt, new TtlRedis() as never, config());
    const expired = await jwt.signAsync(
      { sub: kp.publicKey(), type: 'refresh', jti: 'expired', roles: [] },
      { secret: config().jwtSecret, expiresIn: -10 },
    );
    const access = await jwt.signAsync(
      { sub: kp.publicKey(), type: 'access', jti: 'access', roles: [] },
      { secret: config().jwtSecret, expiresIn: 900 },
    );

    await expect(service.refresh(expired)).rejects.toBeInstanceOf(TokenExpiredException);
    await expect(service.refresh(access)).rejects.toBeInstanceOf(InvalidCredentialsException);
  });

  it('propagates Redis failures instead of silently authenticating', async () => {
    const redis = new TtlRedis();
    jest.spyOn(redis, 'get').mockRejectedValueOnce(new Error('redis down'));
    const service = new AuthService(new JwtService(), redis as never, config());

    await expect(service.verifyWallet(kp.publicKey(), 'c2ln')).rejects.toThrow('redis down');
  });
});
