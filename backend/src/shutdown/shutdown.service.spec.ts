import { Test, TestingModule } from '@nestjs/testing';
import { ShutdownService } from './shutdown.service';

describe('ShutdownService', () => {
  let service: ShutdownService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [ShutdownService],
    }).compile();

    service = module.get<ShutdownService>(ShutdownService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  it('should return false before shutdown is initiated', () => {
    expect(service.isShuttingDown()).toBe(false);
  });

  it('should return true after initiateShutdown is called', () => {
    service.initiateShutdown();
    expect(service.isShuttingDown()).toBe(true);
  });

  it('should remain true after multiple calls to initiateShutdown', () => {
    service.initiateShutdown();
    service.initiateShutdown();
    expect(service.isShuttingDown()).toBe(true);
  });
});
