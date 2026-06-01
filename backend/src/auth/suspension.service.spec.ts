import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { AuditLogService } from './audit-log.service';
import { RefreshToken } from './entities/refresh-token.entity';
import { SuspensionService } from './suspension.service';
import { User } from '../users/entities/user.entity';
import { UserSuspension } from '../users/entities/user-suspension.entity';

const mockUser = (): User =>
  ({
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
  } as unknown as User);

const mockSuspension = (): UserSuspension =>
  ({
    id: 'suspension-1',
    userId: 'user-1',
    reason: 'Abusive behavior',
    suspendedBy: 'admin-1',
    suspendedAt: new Date('2026-01-01T00:00:00.000Z'),
    suspendedUntil: new Date('2026-01-10T00:00:00.000Z'),
    liftedAt: null,
    liftedBy: null,
    liftedReason: null,
  } as unknown as UserSuspension);

describe('SuspensionService', () => {
  let service: SuspensionService;

  const userRepo = {
    findOne: jest.fn(),
  };
  const suspensionRepo = {
    createQueryBuilder: jest.fn(),
    save: jest.fn(),
  };
  const refreshTokenRepo = {
    createQueryBuilder: jest.fn(),
  };
  const auditLogService = {
    logEvent: jest.fn(),
    logUserSuspension: jest.fn(),
    logUserUnsuspension: jest.fn(),
  };
  const manager = {
    create: jest.fn(),
    save: jest.fn(),
    createQueryBuilder: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        SuspensionService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(UserSuspension), useValue: suspensionRepo },
        { provide: getRepositoryToken(RefreshToken), useValue: refreshTokenRepo },
        { provide: AuditLogService, useValue: auditLogService },
        {
          provide: DataSource,
          useValue: {
            transaction: (handler: (managerArg: typeof manager) => Promise<unknown>) => handler(manager),
          },
        },
      ],
    }).compile();

    service = module.get(SuspensionService);
  });

  describe('suspendUser', () => {
    it('throws NotFoundException when user does not exist', async () => {
      userRepo.findOne.mockResolvedValue(null);
      await expect(service.suspendUser('missing', 'admin-1', 'Bad actor', 7)).rejects.toThrow(
        NotFoundException,
      );
    });

    it('throws BadRequestException when user already has an active suspension', async () => {
      userRepo.findOne.mockResolvedValue(mockUser());
      const queryBuilder: any = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(mockSuspension()),
      };
      suspensionRepo.createQueryBuilder.mockReturnValue(queryBuilder);

      await expect(service.suspendUser('user-1', 'admin-1', 'Abuse', 3)).rejects.toThrow(
        BadRequestException,
      );
    });

    it('creates a suspension record and revokes active refresh tokens', async () => {
      userRepo.findOne.mockResolvedValue(mockUser());
      const queryBuilder: any = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };
      suspensionRepo.createQueryBuilder.mockReturnValue(queryBuilder);
      manager.create.mockReturnValue(mockSuspension());
      manager.save.mockResolvedValue(mockSuspension());
      const refreshUpdateBuilder: any = {
        update: jest.fn().mockReturnThis(),
        set: jest.fn().mockReturnThis(),
        where: jest.fn().mockReturnThis(),
        execute: jest.fn().mockResolvedValue(undefined),
      };
      manager.createQueryBuilder.mockReturnValue(refreshUpdateBuilder);

      const result = await service.suspendUser('user-1', 'admin-1', 'Abusive behavior', 5);

      expect(result).toEqual(mockSuspension());
      expect(manager.create).toHaveBeenCalledWith(UserSuspension, expect.objectContaining({
        userId: 'user-1',
        reason: 'Abusive behavior',
        suspendedBy: 'admin-1',
      }));
      expect(refreshUpdateBuilder.execute).toHaveBeenCalled();
      expect(auditLogService.logUserSuspension).toHaveBeenCalledWith(expect.objectContaining({
        userId: 'user-1',
        suspendedBy: 'admin-1',
      }));
    });
  });

  describe('unsuspendUser', () => {
    it('throws NotFoundException when no active suspension exists', async () => {
      const queryBuilder: any = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(null),
      };
      suspensionRepo.createQueryBuilder.mockReturnValue(queryBuilder);

      await expect(service.unsuspendUser('user-1', 'admin-1')).rejects.toThrow(NotFoundException);
    });

    it('marks active suspension as lifted', async () => {
      const activeSuspension = mockSuspension();
      const queryBuilder: any = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        orderBy: jest.fn().mockReturnThis(),
        getOne: jest.fn().mockResolvedValue(activeSuspension),
      };
      suspensionRepo.createQueryBuilder.mockReturnValue(queryBuilder);
      suspensionRepo.save.mockResolvedValue({ ...activeSuspension, liftedAt: new Date(), liftedBy: 'admin-1' });

      const result = await service.unsuspendUser('user-1', 'admin-1');

      expect(result.liftedAt).toBeInstanceOf(Date);
      expect(result.liftedBy).toBe('admin-1');
      expect(auditLogService.logUserUnsuspension).toHaveBeenCalledWith(expect.objectContaining({
        userId: 'user-1',
        liftedBy: 'admin-1',
      }));
    });
  });
});
