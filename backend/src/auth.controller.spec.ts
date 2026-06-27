import { HttpException, HttpStatus } from '@nestjs/common';
import { Keypair } from 'stellar-sdk';
import { AuthController } from './auth.controller';
import { RedisService } from './redis/redis.service';

const validStellarAddress = Keypair.random().publicKey();

describe('AuthController', () => {
  let controller: AuthController;
  let redisService: jest.Mocked<Pick<RedisService, 'set' | 'get' | 'del' | 'getClient'>>;

  beforeEach(() => {
    redisService = {
      set: jest.fn(),
      get: jest.fn(),
      del: jest.fn(),
      getClient: jest.fn(),
    };

    controller = new AuthController(
      redisService as unknown as RedisService,
      undefined as any, // authService
      undefined as any, // userService
      undefined as any, // loginAttemptService
      undefined as any, // auditLogService
      undefined as any, // refreshTokenService
    );
  });

  it('returns a nonce and expiresAt for a valid Stellar wallet address', async () => {
    const result = await controller.getNonce(validStellarAddress);

    expect(typeof result.nonce).toBe('string');
    expect(result.nonce).toHaveLength(64);
    expect(result.nonce).toMatch(/^[0-9a-f]+$/);
    expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(redisService.set).toHaveBeenCalledWith(
      validStellarAddress,
      result.nonce,
      300,
      'nonce',
    );
  });

  it('throws BAD_REQUEST for an invalid Stellar wallet address', async () => {
    await expect(controller.getNonce('invalid-address')).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
    });
  });

  it('normalizes lowercase wallet address to uppercase', async () => {
    const result = await controller.getNonce(validStellarAddress.toLowerCase());
    expect(redisService.set).toHaveBeenCalledWith(
      validStellarAddress,
      result.nonce,
      300,
      'nonce',
    );
  });
});
