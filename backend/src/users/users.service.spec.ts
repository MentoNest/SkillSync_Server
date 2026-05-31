import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { Repository } from 'typeorm';
import { UsersService } from './users.service';
import { User } from './entities/user.entity';
import { Role } from './entities/role.entity';
import { UserStatus } from './enums/user-status.enum';

describe('UsersService', () => {
  let service: UsersService;
  let userRepo: Repository<User>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        UsersService,
        {
          provide: getRepositoryToken(User),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
            create: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(Role),
          useValue: {
            findOne: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<UsersService>(UsersService);
    userRepo = module.get<Repository<User>>(getRepositoryToken(User));
  });

  describe('updateStatus', () => {
    it('should update user status', async () => {
      const user = { id: '1', status: UserStatus.ACTIVE, tokenVersion: 0 } as User;
      jest.spyOn(userRepo, 'findOne').mockResolvedValue(user);
      jest.spyOn(userRepo, 'save').mockImplementation(async (u) => u as any);

      const result = await service.updateStatus('1', UserStatus.SUSPENDED);

      expect(result.status).toBe(UserStatus.SUSPENDED);
      expect(result.tokenVersion).toBe(1);
    });

    it('should throw NotFoundException if user not found', async () => {
      jest.spyOn(userRepo, 'findOne').mockResolvedValue(null);

      await expect(service.updateStatus('1', UserStatus.ACTIVE)).rejects.toThrow(NotFoundException);
    });

    it('should throw BadRequestException when reactivating a deleted user', async () => {
      const user = { id: '1', status: UserStatus.DELETED, tokenVersion: 0 } as User;
      jest.spyOn(userRepo, 'findOne').mockResolvedValue(user);

      await expect(service.updateStatus('1', UserStatus.ACTIVE)).rejects.toThrow(BadRequestException);
    });
  });
});
