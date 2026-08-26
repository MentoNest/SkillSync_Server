import { Test, TestingModule } from '@nestjs/testing';
import { HealthController } from './health.controller';
import { HealthService } from './health.service';

describe('HealthController', () => {
  let controller: HealthController;
  let mockHealthService: any;

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

    const module: TestingModule = await Test.createTestingModule({
      controllers: [HealthController],
      providers: [{ provide: HealthService, useValue: mockHealthService }],
    }).compile();

    controller = module.get<HealthController>(HealthController);
  });

  it('should return health check result', async () => {
    const result = await controller.check();
    expect(result.status).toBe('healthy');
    expect(result.components).toHaveLength(3);
    expect(mockHealthService.check).toHaveBeenCalled();
  });
});
