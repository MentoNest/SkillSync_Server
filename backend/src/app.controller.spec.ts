import { Test, TestingModule } from '@nestjs/testing';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { RedisService } from './redis/redis.service';
import { ShutdownService } from './shutdown/shutdown.service';

const mockRedisService = {
  get: jest.fn().mockResolvedValue(null),
};

describe('AppController', () => {
  let appController: AppController;
  let shutdownService: ShutdownService;

  beforeEach(async () => {
    const app: TestingModule = await Test.createTestingModule({
      controllers: [AppController],
      providers: [
        AppService,
        ShutdownService,
        { provide: RedisService, useValue: mockRedisService },
      ],
    }).compile();

    appController = app.get<AppController>(AppController);
    shutdownService = app.get<ShutdownService>(ShutdownService);
  });

  describe('getHello', () => {
    it('should return "Hello World!"', () => {
      expect(appController.getHello()).toBe('Hello World!');
    });
  });

  describe('health endpoint', () => {
    it('should return 200 with status ok when not shutting down', async () => {
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      await appController.health(res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'ok' }),
      );
    });

    it('should return 503 with status shutting_down when shutdown is initiated', async () => {
      shutdownService.initiateShutdown();

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      await appController.health(res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'shutting_down' }),
      );
    });

    it('should return 503 when redis check fails', async () => {
      mockRedisService.get.mockRejectedValueOnce(new Error('Redis unavailable'));

      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
      } as any;

      await appController.health(res);

      expect(res.status).toHaveBeenCalledWith(503);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ status: 'degraded' }),
      );
    });
  });
});
