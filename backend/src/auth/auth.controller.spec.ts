import { Test, TestingModule } from '@nestjs/testing';
import { ExecutionContext } from '@nestjs/common';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { JwtAuthGuard } from './guards/jwt-auth.guard.js';

describe('AuthController', () => {
  let controller: AuthController;

  const mockAuthService = {
    requestNonce: jest.fn(),
    login: jest.fn(),
    refresh: jest.fn(),
    logout: jest.fn(),
  };

  const mockJwtGuard = { canActivate: (_ctx: ExecutionContext) => true };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [{ provide: AuthService, useValue: mockAuthService }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(mockJwtGuard)
      .compile();

    controller = module.get<AuthController>(AuthController);
  });

  afterEach(() => jest.clearAllMocks());

  it('should call requestNonce with the wallet address', () => {
    mockAuthService.requestNonce.mockReturnValue({ nonce: 'abc', expiresAt: 0 });
    controller.requestNonce({ walletAddress: 'GABC' });
    expect(mockAuthService.requestNonce).toHaveBeenCalledWith('GABC');
  });

  it('should call refresh and return tokens', async () => {
    mockAuthService.refresh.mockResolvedValue({
      accessToken: 'access',
      refreshToken: 'refresh',
      expiresIn: 900,
    });
    const result = await controller.refresh({ refreshToken: 'rt' });
    expect(mockAuthService.refresh).toHaveBeenCalledWith('rt');
    expect(result).toHaveProperty('accessToken');
  });
});
