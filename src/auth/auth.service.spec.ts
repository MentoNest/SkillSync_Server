import { Test, TestingModule } from '@nestjs/testing';
import { AuthService } from './auth.service';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { User } from 'src/user/entities/user.entity';
import { UnauthorizedException } from '@nestjs/common';
import { Response } from 'express';

// Mock bcrypt module
jest.mock('bcrypt', () => ({
  hash: jest.fn().mockResolvedValue('hashedPassword'),
  compare: jest.fn().mockResolvedValue(true),
}));

describe('AuthService', () => {
  let service: AuthService;

  const mockUserRepository = {
    findOne: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };

  const mockJwtService = {
    signAsync: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        {
          provide: getRepositoryToken(User),
          useValue: mockUserRepository,
        },
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
      ],
    }).compile();

    service = module.get<AuthService>(AuthService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('logout', () => {
    it('should successfully logout a user', async () => {
      const userId = 1;
      const mockUser = {
        id: 1,
        email: 'test@example.com',
        refreshToken: 'some-refresh-token',
      };

      const mockResponse = {
        clearCookie: jest.fn(),
      } as unknown as Response;

      mockUserRepository.findOne.mockResolvedValue(mockUser);
      mockUserRepository.save.mockResolvedValue(mockUser);

      const result = await service.logout(userId, mockResponse);

      expect(mockUserRepository.findOne).toHaveBeenCalledWith({
        where: { id: userId },
      });
      expect(mockResponse.clearCookie).toHaveBeenCalledTimes(3); // Called for each cookie name
      expect(result).toEqual({ message: 'Logout successful' });
    });

    it('should throw UnauthorizedException if user not found', async () => {
      const userId = 999;
      const mockResponse = {} as Response;

      mockUserRepository.findOne.mockResolvedValue(null);

      await expect(service.logout(userId, mockResponse)).rejects.toThrow(
        UnauthorizedException,
      );
      expect(mockUserRepository.findOne).toHaveBeenCalledWith({
        where: { id: userId },
      });
    });

    it('should clear cookies on successful logout', async () => {
      const userId = 1;
      const mockUser = {
        id: 1,
        email: 'test@example.com',
      };

      const mockResponse = {
        clearCookie: jest.fn(),
      } as unknown as Response;

      mockUserRepository.findOne.mockResolvedValue(mockUser);

      await service.logout(userId, mockResponse);

      expect(mockResponse.clearCookie).toHaveBeenCalledWith('refreshToken', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
      });
      expect(mockResponse.clearCookie).toHaveBeenCalledWith('refresh_token', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
      });
      expect(mockResponse.clearCookie).toHaveBeenCalledWith('jwt_refresh', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
      });
    });
  });
});