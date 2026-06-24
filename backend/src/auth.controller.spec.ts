import { HttpException, HttpStatus } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { RedisService } from './redis/redis.service';

const validStellarAddress = 'GCFX3YN77M5QMZJGZW3GNMXLI3NQ6O5O7PMKFYSJ7RVMDG4OPDUM5A7R';

describe('AuthController', () => {
  let controller: AuthController;
  let redisService: RedisService;
  let mockClient: Record<string, jest.Mock>;

  beforeEach(() => {
    mockClient = {
      incr: jest.fn(),
      expire: jest.fn(),
    };

    redisService = {
      set: jest.fn(),
      getClient: jest.fn().mockReturnValue(mockClient),
    } as unknown as RedisService;

    controller = new AuthController(redisService);
  });

  it('returns a nonce and expiresAt for a valid Stellar wallet address', async () => {
    mockClient.incr.mockResolvedValue(1);

    const result = await controller.getNonce(validStellarAddress);

    expect(typeof result.nonce).toBe('string');
    expect(result.nonce).toHaveLength(64);
    expect(result.nonce).toMatch(/^[0-9a-f]+$/);
    expect(new Date(result.expiresAt).getTime()).toBeGreaterThan(Date.now());
    expect(redisService.set).toHaveBeenCalledWith(validStellarAddress, result.nonce, 300, 'nonce');
    expect(mockClient.expire).toHaveBeenCalledWith(`rate:${validStellarAddress}`, 60);
  });

  it('throws BAD_REQUEST for an invalid Stellar wallet address', async () => {
    await expect(controller.getNonce('invalid-address')).rejects.toThrow(HttpException);
    await expect(controller.getNonce('invalid-address')).rejects.toMatchObject({
      status: HttpStatus.BAD_REQUEST,
    });
  });

  it('throws TOO_MANY_REQUESTS when rate limit is exceeded', async () => {
    mockClient.incr.mockResolvedValue(6);

    await expect(controller.getNonce(validStellarAddress)).rejects.toThrow(HttpException);
    await expect(controller.getNonce(validStellarAddress)).rejects.toMatchObject({
      status: HttpStatus.TOO_MANY_REQUESTS,
    });
  });
});
