import { Test, TestingModule } from '@nestjs/testing';
import { RedisService } from './redis.service';

const mockClient = {
  connect: jest.fn().mockResolvedValue(undefined),
  quit: jest.fn().mockResolvedValue(undefined),
  disconnect: jest.fn(),
  get: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  expire: jest.fn(),
  exists: jest.fn(),
  incr: jest.fn(),
  ping: jest.fn(),
  on: jest.fn(),
};

jest.mock('ioredis', () => {
  return {
    __esModule: true,
    default: jest.fn().mockImplementation(() => mockClient),
  };
});

describe('RedisService', () => {
  let service: RedisService;

  beforeEach(async () => {
    jest.clearAllMocks();

    const module: TestingModule = await Test.createTestingModule({
      providers: [RedisService],
    }).compile();

    service = module.get<RedisService>(RedisService);
  });

  it('connects on module init', async () => {
    await service.onModuleInit();
    expect(mockClient.connect).toHaveBeenCalled();
  });

  it('does not throw when the initial connection fails', async () => {
    mockClient.connect.mockRejectedValueOnce(new Error('ECONNREFUSED'));
    await expect(service.onModuleInit()).resolves.toBeUndefined();
  });

  it('delegates get/set/del/expire to the underlying client', async () => {
    mockClient.get.mockResolvedValue('value');
    await expect(service.get('key')).resolves.toBe('value');
    expect(mockClient.get).toHaveBeenCalledWith('key');

    mockClient.set.mockResolvedValue('OK');
    await service.set('key', 'value');
    expect(mockClient.set).toHaveBeenCalledWith('key', 'value');

    await service.set('key', 'value', 60);
    expect(mockClient.set).toHaveBeenCalledWith('key', 'value', 'EX', 60);

    mockClient.del.mockResolvedValue(1);
    await expect(service.del('key')).resolves.toBe(1);

    mockClient.expire.mockResolvedValue(1);
    await expect(service.expire('key', 30)).resolves.toBe(true);
  });

  it('reports healthy when Redis responds PONG', async () => {
    mockClient.ping.mockResolvedValue('PONG');
    await expect(service.isHealthy()).resolves.toBe(true);
  });

  it('reports unhealthy when the ping fails', async () => {
    mockClient.ping.mockRejectedValue(new Error('down'));
    await expect(service.isHealthy()).resolves.toBe(false);
  });

  it('increments counters atomically via the client', async () => {
    mockClient.incr.mockResolvedValue(5);
    await expect(service.incr('counter')).resolves.toBe(5);
    expect(mockClient.incr).toHaveBeenCalledWith('counter');
  });

  it('quits the client on module destroy', async () => {
    await service.onModuleDestroy();
    expect(mockClient.quit).toHaveBeenCalled();
  });
});
