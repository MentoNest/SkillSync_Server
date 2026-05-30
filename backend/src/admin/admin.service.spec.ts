import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { NotFoundException } from '@nestjs/common';
import { AdminService } from './admin.service';
import { SuspensionService } from '../auth/suspension.service';
import { User } from '../users/entities/user.entity';
import { ProfileHistory } from '../users/entities/profile-history.entity';

const mockUser = (): User =>
  ({
    id: 'user-1',
    walletAddress: 'GABC',
    isVerified: false,
    verifiedAt: null,
    verifiedBy: null,
    verificationNotes: null,
    tokenVersion: 0,
    roles: [],
  }) as unknown as User;

describe('AdminService', () => {
  let service: AdminService;

  const userRepo = {
    findOne: jest.fn(),
    save: jest.fn((u: User) => Promise.resolve(u)),
  };

  const historyRepo = {
    findAndCount: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AdminService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: getRepositoryToken(ProfileHistory), useValue: historyRepo },
        { provide: SuspensionService, useValue: { getActiveSuspension: jest.fn(), suspendUser: jest.fn(), unsuspendUser: jest.fn(), listActiveSuspensions: jest.fn() } },
      ],
    }).compile();

    service = module.get(AdminService);
    jest.clearAllMocks();
  });

  describe('verifyMentor', () => {
    it('sets isVerified=true and saves', async () => {
      const user = mockUser();
      userRepo.findOne.mockResolvedValue(user);

      const result = await service.verifyMentor('user-1', 'admin-1', 'Verified credentials');

      expect(result.isVerified).toBe(true);
      expect(result.verifiedBy).toBe('admin-1');
      expect(result.verificationNotes).toBe('Verified credentials');
      expect(result.verifiedAt).toBeInstanceOf(Date);
      expect(userRepo.save).toHaveBeenCalledWith(user);
    });

    it('throws NotFoundException when user not found', async () => {
      userRepo.findOne.mockResolvedValue(null);
      await expect(service.verifyMentor('missing', 'admin-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('revokeVerification', () => {
    it('sets isVerified=false and clears fields', async () => {
      const user = { ...mockUser(), isVerified: true, verifiedAt: new Date(), verifiedBy: 'admin-1' } as User;
      userRepo.findOne.mockResolvedValue(user);

      const result = await service.revokeVerification('user-1', 'admin-2');

      expect(result.isVerified).toBe(false);
      expect(result.verifiedAt).toBeNull();
      expect(result.verifiedBy).toBe('admin-2');
      expect(result.verificationNotes).toBeNull();
    });

    it('throws NotFoundException when user not found', async () => {
      userRepo.findOne.mockResolvedValue(null);
      await expect(service.revokeVerification('missing', 'admin-1')).rejects.toThrow(NotFoundException);
    });
  });

  describe('getProfileHistory', () => {
    it('returns paginated history for a user', async () => {
      const items = [{ id: 'h1', userId: 'user-1', fieldName: 'isVerified' }];
      historyRepo.findAndCount.mockResolvedValue([items, 1]);

      const result = await service.getProfileHistory('user-1', 10, 0);

      expect(result.items).toEqual(items);
      expect(result.total).toBe(1);
      expect(historyRepo.findAndCount).toHaveBeenCalledWith({
        where: { userId: 'user-1' },
        order: { changedAt: 'DESC' },
        take: 10,
        skip: 0,
      });
    });
  });
});
