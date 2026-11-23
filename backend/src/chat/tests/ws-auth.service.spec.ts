import { UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Keypair } from '@stellar/stellar-sdk';
import { Role } from '../../auth/auth.types';
import type { AuthConfig } from '../../auth/auth.types';
import { InvalidCredentialsException } from '../../common/errors/app-exceptions';
import { WsAuthService, extractToken } from '../ws-auth.service';

const jwt = new JwtService();
const config: AuthConfig = {
  jwtSecret: 'ws-auth-test-secret-at-least-16-characters',
  accessTtlSeconds: 900,
  refreshTtlSeconds: 3600,
  nonceTtlSeconds: 300,
  adminAddresses: [],
  mentorAddresses: [],
};
const address = Keypair.random().publicKey();

const makeService = (revoked = false) =>
  new WsAuthService(jwt, config, {
    isRevoked: jest.fn(() => Promise.resolve(revoked)),
  } as never);

const sign = (
  overrides: Record<string, unknown> = {},
  expiresIn: number = 900,
) =>
  jwt.signAsync(
    {
      sub: address,
      roles: [Role.USER],
      type: 'access',
      jti: 'jti-1',
      ...overrides,
    },
    { secret: config.jwtSecret, expiresIn },
  );

describe('extractToken', () => {
  it('prefers auth.token, then the Authorization header, then the query token', () => {
    expect(
      extractToken({
        auth: { token: 'Bearer auth-token' },
        headers: { authorization: 'Bearer header-token' },
        query: { token: 'query-token' },
      }),
    ).toBe('auth-token');
    expect(
      extractToken({ headers: { Authorization: 'Bearer header-token' } }),
    ).toBe('header-token');
    expect(extractToken({ query: { token: 'query-token' } })).toBe(
      'query-token',
    );
    expect(extractToken({ auth: { token: 42 } })).toBeNull();
    expect(extractToken({})).toBeNull();
  });
});

describe('WsAuthService', () => {
  it('accepts an unrevoked access token and returns the current AuthUser shape', async () => {
    const token = await sign();
    await expect(
      makeService().authenticate({ auth: { token } }),
    ).resolves.toEqual({
      address,
      roles: [Role.USER],
      jti: 'jti-1',
    });
  });

  it('rejects missing, malformed and expired tokens', async () => {
    await expect(makeService().authenticate({})).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(
      makeService().authenticate({ auth: { token: 'not-a-jwt' } }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    const expired = await sign({}, -10);
    await expect(
      makeService().authenticate({ auth: { token: expired } }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  it('rejects refresh tokens and revoked access tokens', async () => {
    const refresh = await sign({ type: 'refresh' });
    await expect(
      makeService().authenticate({ auth: { token: refresh } }),
    ).rejects.toBeInstanceOf(InvalidCredentialsException);

    const access = await sign();
    await expect(
      makeService(true).authenticate({ auth: { token: access } }),
    ).rejects.toBeInstanceOf(InvalidCredentialsException);
  });
});
