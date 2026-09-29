import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller.js';
import { HealthService } from './health.service.js';

describe('HealthController', () => {
  let controller: HealthController;
  let mockHealthService: any;
  let mockResponse: any;

  beforeEach(async () => {
    mockHealthService = {
      check: jest.fn().mockResolvedValue({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: 100,
        components: [
          { name: 'database', status: 'healthy', responseTimeMs: 5 },
          { name: 'redis', status: 'healthy', responseTimeMs: 2 },
          { name: 'memory', status: 'healthy', responseTimeMs: 0 },
        ],
      }),
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: mockHealthService }],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should return health check result', async () => {
    await controller.check(mockResponse);
    expect(mockResponse.status).toHaveBeenCalledWith(200);
    expect(mockResponse.json).toHaveBeenCalledWith(
      expect.objectContaining({
        status: 'healthy',
        components: expect.any(Array),
      }),
    );
    expect(mockHealthService.check).toHaveBeenCalled();
  });

  it('should return HTTP 503 when a dependency is unhealthy', async () => {
    mockHealthService.check.mockResolvedValue({
      status: 'unhealthy',
      timestamp: new Date().toISOString(),
      uptime: 100,
      components: [{ name: 'database', status: 'unhealthy', responseTimeMs: 3 }],
    });

    await controller.check(mockResponse);
    expect(mockResponse.status).toHaveBeenCalledWith(503);
  });

  it('should provide a dependency-independent liveness response', () => {
    expect(controller.live()).toMatchObject({ status: 'ok' });
  });
});
