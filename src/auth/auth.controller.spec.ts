import { Test, TestingModule } from '@nestjs/testing';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from '../common/guard/jwt-auth.guard';
import { Response } from 'express';

// Mock bcrypt module
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashedPassword'),
  compare: jest.fn().mockResolvedValue(true),
}));

describe('AuthController', () => {
  let controller: AuthController;
  let authService: AuthService;

  const mockAuthService = {
    signup: jest.fn(),
    signin: jest.fn(),
    changePassword: jest.fn(),
    logout: jest.fn(),
  };

  const mockJwtAuthGuard = {
    canActivate: jest.fn(() => true),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        {
          provide: AuthService,
          useValue: mockAuthService,
        },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockJwtAuthGuard)
      .compile();

    controller = module.get<AuthController>(AuthController);
    authService = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  describe('logout', () => {
    it('should call authService.logout with correct parameters', async () => {
      const mockRequest = {
        user: { userId: 1 },
      };
      const mockResponse = {
        clearCookie: jest.fn(),
      } as unknown as Response;

      const expectedResult = { message: 'Logout successful' };
      mockAuthService.logout.mockResolvedValue(expectedResult);

      const result = await controller.logout(mockRequest, mockResponse);

      expect(authService.logout).toHaveBeenCalledWith(1, mockResponse);
      expect(result).toEqual(expectedResult);
    });

    it('should handle logout errors', async () => {
      const mockRequest = {
        user: { userId: 1 },
      };
      const mockResponse = {} as Response;

      const error = new Error('Logout failed');
      mockAuthService.logout.mockRejectedValue(error);

      await expect(controller.logout(mockRequest, mockResponse)).rejects.toThrow('Logout failed');
    });
  });
});