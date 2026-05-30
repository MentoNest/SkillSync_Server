import { ForbiddenException, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource, IsNull } from 'typeorm';
import { AuditLogService } from './audit-log.service';
import { AuthService } from './auth.service';
import { RefreshToken } from './entities/refresh-token.entity';
import { SuspensionService } from './suspension.service';
import { User } from '../users/entities/user.entity';

class InMemoryRefreshTokenRepository {
  tokens: RefreshToken[] = [];

  create(data: Partial<RefreshToken>): RefreshToken {
    return Object.assign(new RefreshToken(), data);
  }

  async save(token: RefreshToken): Promise<RefreshToken> {
    token.setIds();
    const existingIndex = this.tokens.findIndex((item) => item.id === token.id);
    if (existingIndex >= 0) {
      this.tokens[existingIndex] = token;
    } else {
      this.tokens.push(token);
    }

    return token;
  }
}

class InMemoryEntityManager {
  constructor(
    private readonly repository: InMemoryRefreshTokenRepository,
    private readonly userRepository: { users: User[]; findOne: (options: { where: { walletAddress?: string; id?: string } }) => Promise<User | null>; save: (user: User) => Promise<User> },
  ) {}

  async findOne(
    entity: typeof RefreshToken | typeof User,
    options: { where: { tokenHash?: string; walletAddress?: string; id?: string } },
  ): Promise<RefreshToken | User | null> {
    if (entity === RefreshToken) {
      return this.repository.tokens.find((token) => token.tokenHash === options.where.tokenHash) ?? null;
    }

    if (entity === User) {
      if (options.where.walletAddress) {
        return (
          this.userRepository.users.find((user) => user.walletAddress === options.where.walletAddress) ??
          null
        );
      }
      if (options.where.id) {
        return this.userRepository.users.find((user) => user.id === options.where.id) ?? null;
      }
    }

    return null;
  }

  async save(entity: typeof RefreshToken | typeof User, item: RefreshToken | User): Promise<RefreshToken | User> {
    if (entity === RefreshToken) {
      return this.repository.save(item as RefreshToken);
    }
    return this.userRepository.save(item as User);
  }

  async update(
    _entity: typeof RefreshToken,
    where: { familyId: string; revokedAt: ReturnType<typeof IsNull> },
    values: Partial<RefreshToken>,
  ): Promise<void> {
    for (const token of this.repository.tokens) {
      if (token.familyId === where.familyId && token.revokedAt === null) {
        Object.assign(token, values);
      }
    }
  }
}

describe('AuthService', () => {
  let service: AuthService;
  let repository: InMemoryRefreshTokenRepository;
  let suspensionServiceMock: { getActiveSuspension: jest.Mock };
  let userStore: {
    users: User[];
    findOne: jest.Mock<Promise<User | null>, [options: { where: { walletAddress?: string; id?: string } }]>
    save: jest.Mock<Promise<User>, [user: User]>;
  };
  let auditLogService: {
    logRefreshTokenUsage: jest.Mock;
    logLoginSuccess: jest.Mock;
    logLoginFailure: jest.Mock;
    logLogout: jest.Mock;
    logPasswordEquivalentChange: jest.Mock;
    logRoleAssignment: jest.Mock;
  };
  const config: Record<string, string> = {
    JWT_SECRET: 'test-secret',
    REFRESH_TOKEN_HASH_SECRET: 'hash-secret',
    JWT_ACCESS_TOKEN_TTL: '15m',
    JWT_REFRESH_TOKEN_TTL: '30d',
  };

  beforeEach(async () => {
    jest.useFakeTimers().setSystemTime(new Date('2026-01-01T00:00:00.000Z'));
    repository = new InMemoryRefreshTokenRepository();
    const userStore = {
      users: [] as User[],
      findOne: jest.fn(async (options: { where: { walletAddress?: string; id?: string } }) => {
        if (options.where.walletAddress) {
          return userStore.users.find((user) => user.walletAddress === options.where.walletAddress) ?? null;
        }
        if (options.where.id) {
          return userStore.users.find((user) => user.id === options.where.id) ?? null;
        }
        return null;
      }),
      save: jest.fn(async (user: User) => {
        const index = userStore.users.findIndex((existing) => existing.id === user.id);
        if (index >= 0) {
          userStore.users[index] = user;
        } else {
          userStore.users.push(user);
        }
        return user;
      }),
    };

    const manager = new InMemoryEntityManager(repository, userStore);
    auditLogService = {
      logRefreshTokenUsage: jest.fn().mockResolvedValue(undefined),
      logLoginSuccess: jest.fn().mockResolvedValue(undefined),
      logLoginFailure: jest.fn().mockResolvedValue(undefined),
    suspensionServiceMock = { getActiveSuspension: jest.fn().mockResolvedValue(null) };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(RefreshToken),
          useValue: repository,
        },
        {
          provide: SuspensionService,
          useValue: suspensionServiceMock,
        },
        {
          provide: DataSource,
          useValue: {
            manager,
            transaction: (
              handler: (entityManager: InMemoryEntityManager) => Promise<unknown>,
            ) => handler(manager),
              transaction: (
              handler: (entityManager: InMemoryEntityManager) => Promise<unknown>,
            ) => handler(manager),
          },
        },
        {
          provide: ConfigService,
          useValue: {
            get: (key: string) => config[key],
          },
        },
        {
          provide: AuditLogService,
          useValue: auditLogService,
        },
      ],
    }).compile();

    service = module.get(AuthService);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('rotates refresh tokens and invalidates the previous token', async () => {
    const issued = await service.issueTokenPair(
      { sub: 'user-1', walletAddress: 'GABC' },
      audit(),
    );
    const rotated = await service.refresh(
      issued.refreshToken,
      audit({ ipAddress: '10.0.0.2' }),
    );

    expect(rotated.accessToken).toBeDefined();
    expect(rotated.refreshToken).not.toBe(issued.refreshToken);
    expect(repository.tokens).toHaveLength(2);
    expect(repository.tokens[0].revokedAt).toBeInstanceOf(Date);
    expect(repository.tokens[0].replacedByTokenId).toBe(repository.tokens[1].id);
    expect(repository.tokens[1].revokedAt).toBeNull();
    expect(repository.tokens[1].ipAddress).toBe('10.0.0.2');
    expect(auditLogService.logRefreshTokenUsage).toHaveBeenCalledWith(
      expect.objectContaining({ success: true, userId: 'user-1' }),
    );
  });

  it('returns 401 when the refresh token is expired', async () => {
    const issued = await service.issueTokenPair({ sub: 'user-1' }, audit());
    jest.setSystemTime(new Date('2026-02-01T00:00:01.000Z'));

    await expect(service.refresh(issued.refreshToken, audit())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    expect(auditLogService.logRefreshTokenUsage).toHaveBeenCalledWith(
      blocks login for suspended users with suspension reason', async () => {
    userStore.users.push({
      id: 'user-1',
      walletAddress: 'GABC',
      tokenVersion: 0,
      timezone: 'UTC',
      avatarUrl: null,
      avatarThumbnailUrl: null,
      isVerified: false,
      verifiedAt: null,
      verifiedBy: null,
      verificationNotes: null,
      roles: [],
    } as unknown as User);

    const suspended = {
      id: 'suspension-1',
      userId: 'user-1',
      reason: 'Policy violation',
      suspendedBy: 'admin-1',
      suspendedAt: new Date('2026-01-01T00:00:00.000Z'),
      suspendedUntil: new Date('2026-01-10T00:00:00.000Z'),
      liftedAt: null,
      liftedBy: null,
      liftedReason: null,
    } as unknown as any;
    suspensionServiceMock.getActiveSuspension.mockResolvedValue(suspended);

    await expect(service.login('GABC', audit())).rejects.toBeInstanceOf(ForbiddenException);
    expect(auditLogService.logLoginFailure).toHaveBeenCalledWith(
      'GABC',
      expect.anything(),
      'Account suspended',
    );
  });

  it('blocks refresh for suspended users with suspension reason', async () => {
    const issued = await service.issueTokenPair({ sub: 'user-1', walletAddress: 'GABC' }, audit());
    const suspended = {
      id: 'suspension-1',
      userId: 'user-1',
      reason: 'Policy violation',
      suspendedBy: 'admin-1',
      suspendedAt: new Date('2026-01-01T00:00:00.000Z'),
      suspendedUntil: new Date('2026-01-10T00:00:00.000Z'),
      liftedAt: null,
      liftedBy: null,
      liftedReason: null,
    } as unknown as any;
    suspensionServiceMock.getActiveSuspension.mockResolvedValue(suspended);

    await expect(service.refresh(issued.refreshToken, audit())).rejects.toBeInstanceOf(ForbiddenException);
    expect(auditLogService.logRefreshTokenUsage).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, userId: 'user-1' }),
    );
  });

  it('expect.objectContaining({ success: false, userId: 'user-1' }),
    );
  });

  it('detects refresh token reuse and revokes the token family', async () => {
    const issued = await service.issueTokenPair({ sub: 'user-1' }, audit());
    await service.refresh(issued.refreshToken, audit());

    await expect(service.refresh(issued.refreshToken, audit())).rejects.toBeInstanceOf(
      UnauthorizedException,
    );

    expect(repository.tokens.every((token) => token.revokedAt)).toBe(true);
    expect(repository.tokens.every((token) => token.concurrentReuseDetectedAt)).toBe(true);
  });
});

function audit(
  overrides: Partial<{
    ipAddress: string;
    userAgent: string;
    deviceFingerprint: string;
  }> = {},
) {
  return {
    ipAddress: overrides.ipAddress ?? '127.0.0.1',
    userAgent: overrides.userAgent ?? 'jest',
    deviceFingerprint: overrides.deviceFingerprint ?? 'device-1',
  };
}
