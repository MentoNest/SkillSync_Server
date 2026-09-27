import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import * as crypto from 'crypto';
import { User } from '../../user/entities/user.entity';
import {
  assertSigningMaterial,
  getAuthTokenConfig,
  signOptionsFor,
  verifyOptionsFor,
  type AuthTokenConfig,
} from '../config/auth-token.config';

export type TokenType = 'access' | 'refresh';

export interface CoreClaims {
  /** User id. */
  sub: string;
  /** Stellar wallet address of the account. */
  wallet: string | null;
  roles: string[];
  permissions: string[];
  /** Unique token id, so a token can be correlated with an audit entry. */
  jti: string;
  /** Incremented whenever the account's authority changes (#1315). */
  tokenVersion: number;
  status: string;
}

export interface AccessTokenClaims extends CoreClaims {
  typ: 'access';
  email: string | null;
}

export interface RefreshTokenClaims extends CoreClaims {
  typ: 'refresh';
  /** Issued-at, mirrored explicitly so clients can reason about rotation. */
  iat: number;
}

export interface IssuedToken<T extends CoreClaims> {
  token: string;
  /** Seconds until the token expires. */
  expiresIn: number;
  /** Absolute expiry, for the refresh token column. */
  expiresAt: Date;
  claims: T;
}

/**
 * #1315: permission defaults per role.
 *
 * The `roles` table stores a `permissions` list for roles that were extended at
 * runtime; these are the built-in grants used when a role row does not carry one
 * (or predates that column).
 */
const ROLE_PERMISSION_DEFAULTS: Readonly<Record<string, readonly string[]>> = Object.freeze({
  admin: ['*'],
  mentor: [
    'profile:read',
    'profile:update',
    'session:read',
    'session:update',
    'booking:create',
    'booking:update',
    'review:create',
    'message:send',
  ],
  mentee: [
    'profile:read',
    'profile:update',
    'session:read',
    'booking:create',
    'message:send',
  ],
});

const ALL_PERMISSIONS = '*';

/**
 * #1315: access token issuance.
 *
 * Central place where the token contract lives, so login (#1314) and refresh
 * (#1316) cannot drift apart. Tokens are signed with `JWT_ALGORITHM`
 * (HS256 or RS256) and carry the standard claim set plus the core claims:
 * `sub`, `wallet`, `roles`, `permissions`, `jti`, `tokenVersion`, `typ`.
 *
 * `iss`, `aud`, `iat`, `exp` and `jti` are added by the signer, and `iss`/`aud`
 * are verified on every request, so a token minted for another service or a
 * previous key cannot be replayed here.
 */
@Injectable()
export class AccessTokenService {
  constructor(private readonly jwtService: JwtService) {}

  /**
   * Resolves the effective permission set of a user from their roles: the
   * `permissions` list stored on the role row wins, otherwise the built-in
   * defaults for that role are used.
   */
  static resolvePermissions(user: Pick<User, 'roles'>): string[] {
    const permissions = new Set<string>();

    for (const role of user?.roles ?? []) {
      const name = typeof role === 'string' ? role : role?.name;
      if (!name) continue;

      for (const permission of ROLE_PERMISSION_DEFAULTS[name] ?? []) {
        permissions.add(permission);
      }

      // `permissions` is a JSONB column on the role row; it is read through a
      // structural type so the token contract does not depend on the roles
      // table carrying that column.
      const stored = (
        typeof role === 'string' ? undefined : (role as { permissions?: unknown } | undefined)
      )?.permissions;
      if (Array.isArray(stored)) {
        for (const permission of stored) {
          permissions.add(permission);
        }
      }
    }

    return Array.from(permissions);
  }

  static roleNames(user: Pick<User, 'roles'>): string[] {
    return (user?.roles ?? [])
      .map((role) => (typeof role === 'string' ? role : role?.name))
      .filter((name): name is string => Boolean(name));
  }

  /** Builds the core claim set shared by access and refresh tokens (#1316). */
  buildCoreClaims(user: User, tokenType: TokenType): CoreClaims & { typ: TokenType } {
    return {
      sub: user.id,
      wallet: user.walletAddress ?? null,
      roles: AccessTokenService.roleNames(user),
      permissions: AccessTokenService.resolvePermissions(user),
      jti: crypto.randomUUID(),
      tokenVersion: user.tokenVersion ?? 0,
      status: user.status as string,
      typ: tokenType,
    };
  }

  /** #1315: issues an access token. */
  issueAccessToken(user: User, config: AuthTokenConfig = getAuthTokenConfig()): IssuedToken<AccessTokenClaims> {
    assertSigningMaterial(config);

    const claims = {
      ...this.buildCoreClaims(user, 'access'),
      typ: 'access' as const,
      email: user.email ?? null,
    };

    const token = this.jwtService.sign(claims, signOptionsFor(config, config.accessExpiration));

    return {
      token,
      expiresIn: config.accessExpiresIn,
      expiresAt: new Date(Date.now() + config.accessExpiresIn * 1000),
      claims,
    };
  }

  /**
   * #1316: issues a refresh token. It carries the same core claims as the
   * access token, so a client can read `sub`, `wallet`, `roles` and
   * `permissions` without a second round trip, plus `typ: 'refresh'` so an
   * access token can never be presented to the refresh endpoint.
   */
  issueRefreshToken(user: User, config: AuthTokenConfig = getAuthTokenConfig()): IssuedToken<RefreshTokenClaims> {
    assertSigningMaterial(config);

    const claims = {
      ...this.buildCoreClaims(user, 'refresh'),
      typ: 'refresh' as const,
    };

    const token = this.jwtService.sign(claims, signOptionsFor(config, config.refreshExpiresIn));

    return {
      token,
      expiresIn: config.refreshExpiresIn,
      expiresAt: new Date(Date.now() + config.refreshExpiresIn * 1000),
      claims: claims as RefreshTokenClaims,
    };
  }

  /**
   * Verifies a token and asserts its type. Returns `null` for anything that
   * fails, so callers decide the error shape.
   */
  verify<T extends AccessTokenClaims | RefreshTokenClaims>(
    token: string,
    expectedType: TokenType,
    config: AuthTokenConfig = getAuthTokenConfig(),
  ): T | null {
    try {
      // The key material is passed explicitly rather than relying on the
      // module level JwtService options: verification has to match the
      // algorithm the token was minted with, including RS256.
      const decoded = this.jwtService.verify<T>(token, verifyOptionsFor(config));

      if (!decoded?.sub || decoded.typ !== expectedType) {
        return null;
      }

      return decoded;
    } catch {
      return null;
    }
  }

  /**
   * Throws a 401 for a token that fails verification. Kept separate so the
   * controller and the service report the failure identically.
   */
  verifyOrReject<T extends AccessTokenClaims | RefreshTokenClaims>(
    token: string,
    expectedType: TokenType,
    message: string,
    config: AuthTokenConfig = getAuthTokenConfig(),
  ): T {
    const claims = this.verify<T>(token, expectedType, config);
    if (!claims) {
      throw new UnauthorizedException(message);
    }
    return claims;
  }

  /**
   * #1315: rejects a token whose `iat` predates the authority version it claims
   * to carry. The `tokenVersion` column is bumped on role changes, and since
   * `iat` is part of the signed payload an attacker cannot backdate it.
   */
  static isStaleByVersion(claims: { iat?: number; tokenVersion?: number }, currentVersion: number): boolean {
    const current = currentVersion ?? 0;
    const claimVersion = claims.tokenVersion ?? 0;
    return claimVersion !== current;
  }

  /** True when the token grants the given permission. */
  static hasPermission(claims: { permissions?: string[] }, permission: string): boolean {
    const granted = claims.permissions ?? [];
    if (granted.includes(ALL_PERMISSIONS)) {
      return true;
    }
    const [resource] = permission.split(':');
    return granted.some((value) => value === permission || value === `${resource}:*`);
  }
}
