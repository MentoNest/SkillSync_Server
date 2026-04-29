import { Test, TestingModule } from '@nestjs/testing';
import { RequestContextService, RequestContextData } from './request-context.service';

describe('RequestContextService', () => {
  let service: RequestContextService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [RequestContextService],
    }).compile();

    service = module.get<RequestContextService>(RequestContextService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createRequestId', () => {
    it('should generate a valid UUID v4', () => {
      const requestId = RequestContextService.createRequestId();
      expect(requestId).toBeDefined();
      expect(typeof requestId).toBe('string');
      // UUID v4 format: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      expect(requestId).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it('should generate unique IDs', () => {
      const id1 = RequestContextService.createRequestId();
      const id2 = RequestContextService.createRequestId();
      expect(id1).not.toBe(id2);
    });
  });

  describe('getOrCreateRequestId', () => {
    it('should return existing header value if provided', () => {
      const headerId = 'existing-request-id-123';
      const result = RequestContextService.getOrCreateRequestId(headerId);
      expect(result).toBe(headerId);
    });

    it('should generate new UUID if header is undefined', () => {
      const result = RequestContextService.getOrCreateRequestId(undefined);
      expect(result).toBeDefined();
      expect(result).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });

    it('should generate new UUID if header is empty string', () => {
      const result = RequestContextService.getOrCreateRequestId('');
      expect(result).toBeDefined();
      expect(result).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
    });
  });

  describe('run and getContext', () => {
    it('should store and retrieve request context', () => {
      const context: RequestContextData = {
        requestId: 'test-request-id-123',
        timestamp: new Date(),
      };

      let retrievedContext: RequestContextData | undefined;

      service.run(context, () => {
        retrievedContext = service.getContext();
      });

      expect(retrievedContext).toEqual(context);
    });

    it('should return undefined outside of run context', () => {
      const context = service.getContext();
      expect(context).toBeUndefined();
    });

    it('should isolate context between different run calls', () => {
      const context1: RequestContextData = {
        requestId: 'request-1',
        timestamp: new Date(),
      };

      const context2: RequestContextData = {
        requestId: 'request-2',
        timestamp: new Date(),
      };

      let result1: string | undefined;
      let result2: string | undefined;

      service.run(context1, () => {
        result1 = service.getContext()?.requestId;
      });

      service.run(context2, () => {
        result2 = service.getContext()?.requestId;
      });

      expect(result1).toBe('request-1');
      expect(result2).toBe('request-2');
    });
  });

  describe('getRequestId', () => {
    it('should return request ID from context', () => {
      const context: RequestContextData = {
        requestId: 'test-request-id-456',
        timestamp: new Date(),
      };

      let retrievedId: string | undefined;

      service.run(context, () => {
        retrievedId = service.getRequestId();
      });

      expect(retrievedId).toBe('test-request-id-456');
    });

    it('should return undefined outside of context', () => {
      const requestId = service.getRequestId();
      expect(requestId).toBeUndefined();
    });
  });

  describe('async context propagation', () => {
    it('should propagate context through async operations', async () => {
      const context: RequestContextData = {
        requestId: 'async-request-id',
        timestamp: new Date(),
      };

      await service.run(context, async () => {
        // Simulate async operation
        await new Promise((resolve) => setTimeout(resolve, 10));
        
        const requestId = service.getRequestId();
        expect(requestId).toBe('async-request-id');
      });
    });

    it('should maintain context in nested async calls', async () => {
      const context: RequestContextData = {
        requestId: 'nested-async-request',
        timestamp: new Date(),
      };

      await service.run(context, async () => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        
        const id1 = service.getRequestId();
        expect(id1).toBe('nested-async-request');

        await new Promise((resolve) => setTimeout(resolve, 5));
        
        const id2 = service.getRequestId();
        expect(id2).toBe('nested-async-request');
      });
    });
  });

  describe('performance', () => {
    it('should have minimal overhead (< 1ms)', () => {
      const context: RequestContextData = {
        requestId: 'perf-test',
        timestamp: new Date(),
      };

      const iterations = 1000;
      const start = process.hrtime();

      for (let i = 0; i < iterations; i++) {
        service.run(context, () => {
          service.getRequestId();
        });
      }

      const diff = process.hrtime(start);
      const durationMs = (diff[0] * 1000 + diff[1] / 1000000) / iterations;

      // Each operation should take less than 1ms on average
      expect(durationMs).toBeLessThan(1);
    });
  });
});
