import { Test, TestingModule } from '@nestjs/testing';
import { AdminRolesController } from './admin-roles.controller.js';
import { UsersService } from './users.service.js';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard.js';
import { RolesGuard } from '../auth/guards/roles.guard.js';
import { AuthRole } from '../common/enums/auth-role.enum.js';

describe('AdminRolesController', () => {
  let controller: AdminRolesController;

  const mockUsersService = {
    assignRole: jest.fn(),
    revokeRole: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AdminRolesController],
      providers: [{ provide: UsersService, useValue: mockUsersService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard)
      .useValue({ canActivate: () => true })
      .compile();

    controller = module.get<AdminRolesController>(AdminRolesController);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('assignRole', () => {
    it('should delegate to usersService.assignRole', async () => {
      mockUsersService.assignRole.mockResolvedValue({ id: 'user-1' });

      const result = await controller.assignRole('user-1', {
        role: AuthRole.MENTOR,
      });

      expect(mockUsersService.assignRole).toHaveBeenCalledWith(
        'user-1',
        AuthRole.MENTOR,
      );
      expect(result).toEqual({ id: 'user-1' });
    });
  });

  describe('revokeRole', () => {
    it('should delegate to usersService.revokeRole', async () => {
      mockUsersService.revokeRole.mockResolvedValue({ id: 'user-1' });

      const result = await controller.revokeRole('user-1', AuthRole.MENTOR);

      expect(mockUsersService.revokeRole).toHaveBeenCalledWith(
        'user-1',
        AuthRole.MENTOR,
      );
      expect(result).toEqual({ id: 'user-1' });
    });
  });
});
