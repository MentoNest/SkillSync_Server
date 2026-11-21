import { JwtService } from '@nestjs/jwt';
import { Keypair } from '@stellar/stellar-sdk';
import { InvalidCredentialsException, TokenExpiredException } from '../../common/errors/app-exceptions';
import { AuthService, loginMessage } from '../auth.service';
import { AuthConfig, buildAuthConfig, Role } from '../auth.types';
import { FakeRedisService } from './fake-redis';

const config = (over: Partial<AuthConfig> = {}): AuthConfig => ({
  jwtSecret: 'test-secret-test-secret',
  accessTtlSeconds: 900,
  refreshTtlSeconds: 3600,
  nonceTtlSeconds: 300,
  adminAddresses: [],
  mentorAddresses: [],
  ...over,
});

function setup(over: Partial<AuthConfig> = {}) {
  const redis = new FakeRedisService();
  const jwt = new JwtService();
  const service = new AuthService(jwt, redis as never, config(over));
  return { redis, jwt, service };
}

async function signedLogin(service: AuthService, keypair: Keypair) {
  const { nonce } = await service.createNonce(keypair.publicKey());
  const signature = keypair.sign(Buffer.from(loginMessage(keypair.publicKey(), nonce))).toString('base64');
  return { nonce, signature };
}

describe('AuthService', () => {
  const keypair = Keypair.random();

  it('logs in with a valid signature and issues access and refresh tokens', async () => {
    const { service, jwt } = setup();
    const { signature } = await signedLogin(service, keypair);

    const tokens = await service.login(keypair.publicKey(), signature);

    expect(tokens.expiresIn).toBe(900);
    const access = jwt.decode(tokens.accessToken);
    const refresh = jwt.decode(tokens.refreshToken);
    expect(access).toMatchObject({ sub: keypair.publicKey(), type: 'access', roles: [Role.USER] });
    expect(refresh).toMatchObject({ sub: keypair.publicKey(), type: 'refresh' });
    expect(access.jti).not.toBe(refresh.jti);
  });

  it('rejects a signature from another key and consumes the nonce', async () => {
    const { service } = setup();
    const { nonce } = await service.createNonce(keypair.publicKey());
    const forged = Keypair.random().sign(Buffer.from(loginMessage(keypair.publicKey(), nonce))).toString('base64');

    await expect(service.login(keypair.publicKey(), forged)).rejects.toBeInstanceOf(InvalidCredentialsException);
    // The nonce is gone, so even the right signature is refused now.
    const good = keypair.sign(Buffer.from(loginMessage(keypair.publicKey(), nonce))).toString('base64');
    await expect(service.login(keypair.publicKey(), good)).rejects.toBeInstanceOf(InvalidCredentialsException);
  });

  it('does not accept a replayed signature', async () => {
    const { service } = setup();
    const { signature } = await signedLogin(service, keypair);
    await service.login(keypair.publicKey(), signature);
    await expect(service.login(keypair.publicKey(), signature)).rejects.toBeInstanceOf(InvalidCredentialsException);
  });

  it('rejects login without a nonce and malformed signatures', async () => {
    const { service } = setup();
    await expect(service.login(keypair.publicKey(), 'AAAA')).rejects.toBeInstanceOf(InvalidCredentialsException);
    await service.createNonce(keypair.publicKey());
    await expect(service.login(keypair.publicKey(), '%%%')).rejects.toBeInstanceOf(InvalidCredentialsException);
  });

  it('issues 256-bit hex nonces with expiry and replaces earlier wallet nonces', async () => {
    const { service, redis } = setup();
    const first = await service.createNonceWithExpiry(keypair.publicKey());
    const second = await service.createNonceWithExpiry(keypair.publicKey());

    expect(first.nonce).toMatch(/^[a-f0-9]{64}$/);
    expect(second.nonce).not.toBe(first.nonce);
    expect(Number.isNaN(Date.parse(first.expiresAt))).toBe(false);
    expect(redis.store.get(`session:nonce:${keypair.publicKey()}`)).toBe(second.nonce);
  });

  it('limits nonce requests to five per wallet per minute', async () => {
    const { service } = setup();
    for (let i = 0; i < 5; i++) await service.createNonceWithExpiry(keypair.publicKey());

    await expect(service.createNonceWithExpiry(keypair.publicKey())).rejects.toMatchObject({ status: 429 });
  });

  it('assigns roles from configured addresses', async () => {
    const { service } = setup({ adminAddresses: [keypair.publicKey()], mentorAddresses: [keypair.publicKey()] });
    expect(service.rolesFor(keypair.publicKey())).toEqual([Role.USER, Role.MENTOR, Role.ADMIN]);
    expect(service.rolesFor(Keypair.random().publicKey())).toEqual([Role.USER]);
  });

  describe('refresh', () => {
    it('rotates the refresh token so the old one cannot be reused', async () => {
      const { service } = setup();
      const { signature } = await signedLogin(service, keypair);
      const first = await service.login(keypair.publicKey(), signature);

      const second = await service.refresh(first.refreshToken);

      expect(second.refreshToken).not.toBe(first.refreshToken);
      await expect(service.refresh(first.refreshToken)).rejects.toBeInstanceOf(InvalidCredentialsException);
      await expect(service.refresh(second.refreshToken)).resolves.toBeDefined();
    });

    it('rejects access tokens, garbage and expired tokens', async () => {
      const { service, jwt } = setup();
      const { signature } = await signedLogin(service, keypair);
      const tokens = await service.login(keypair.publicKey(), signature);

      await expect(service.refresh(tokens.accessToken)).rejects.toBeInstanceOf(InvalidCredentialsException);
      await expect(service.refresh('not-a-token')).rejects.toBeInstanceOf(InvalidCredentialsException);

      const expired = await jwt.signAsync(
        { sub: keypair.publicKey(), type: 'refresh', jti: 'x', roles: [] },
        { secret: 'test-secret-test-secret', expiresIn: -10 },
      );
      await expect(service.refresh(expired)).rejects.toBeInstanceOf(TokenExpiredException);
    });
  });

  describe('logout', () => {
    it('blacklists the access token and revokes the refresh token', async () => {
      const { service, jwt } = setup();
      const { signature } = await signedLogin(service, keypair);
      const tokens = await service.login(keypair.publicKey(), signature);
      const access = jwt.decode(tokens.accessToken);

      await service.logout({ address: keypair.publicKey(), roles: [Role.USER], jti: access.jti }, tokens.refreshToken);

      expect(await service.isRevoked(access.jti)).toBe(true);
      await expect(service.refresh(tokens.refreshToken)).rejects.toBeInstanceOf(InvalidCredentialsException);
    });

    it('ignores a refresh token that belongs to someone else', async () => {
      const { service } = setup();
      const other = Keypair.random();
      const mine = await service.login(keypair.publicKey(), (await signedLogin(service, keypair)).signature);
      const theirs = await service.login(other.publicKey(), (await signedLogin(service, other)).signature);

      await service.logout({ address: keypair.publicKey(), roles: [], jti: 'j' }, theirs.refreshToken);

      await expect(service.refresh(theirs.refreshToken)).resolves.toBeDefined();
      expect(mine.accessToken).toBeDefined();
    });
  });
});

describe('buildAuthConfig', () => {
  it('requires a strong enough JWT_SECRET', () => {
    expect(() => buildAuthConfig(() => undefined)).toThrow('JWT_SECRET');
    expect(() => buildAuthConfig((k) => (k === 'JWT_SECRET' ? 'short' : undefined))).toThrow('JWT_SECRET');
  });

  it('applies defaults and parses address lists', () => {
    const env: Record<string, string> = { JWT_SECRET: 'x'.repeat(20), AUTH_ADMIN_ADDRESSES: ' GA, GB ,,', JWT_ACCESS_TTL_SECONDS: 'nope' };
    const built = buildAuthConfig((k) => env[k]);
    expect(built).toMatchObject({ accessTtlSeconds: 900, refreshTtlSeconds: 604800, nonceTtlSeconds: 300, adminAddresses: ['GA', 'GB'], mentorAddresses: [] });
  });
});
