import { ConfigService } from '@nestjs/config';
import { Test, TestingModule } from '@nestjs/testing';

import { AuditLogService } from './audit-log.service';
import { AuditEventType } from './entities/audit-log.entity';
import { SuspiciousLoginService } from './suspicious-login.service';
import { RedisService } from '../redis/redis.service';

type PipelineMock = {
  incr: jest.Mock;
  expire: jest.Mock;
  sadd: jest.Mock;
  exec: jest.Mock;
};
type ClientMock = {
  multi: jest.Mock;
  get: jest.Mock;
};

const buildConfigService = (overrides: Record<string, number>): ConfigService =>
  ({
    get: <T = number>(key: string, defaultValue?: T): T | undefined => {
      if (key in overrides) {
        return overrides[key] as unknown as T;
      }
      return defaultValue;
    },
  }) as unknown as ConfigService;

describe('SuspiciousLoginService', () => {
  let service: SuspiciousLoginService;
  let redisService: { getClient: jest.Mock };
  let client: ClientMock;
  let pipeline: PipelineMock;
  let auditLog: jest.Mock;

  beforeEach(async () => {
    pipeline = {
      incr: jest.fn().mockReturnThis(),
      expire: jest.fn().mockReturnThis(),
      sadd: jest.fn().mockReturnThis(),
      exec: jest.fn().mockResolvedValue([]),
    };
    client = {
      multi: jest.fn(() => pipeline),
      get: jest.fn(),
    };
    redisService = {
      getClient: jest.fn(() => client),
    };
    auditLog = jest.fn();

    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        SuspiciousLoginService,
        { provide: RedisService, useValue: redisService },
        { provide: AuditLogService, useValue: { logEvent: auditLog } },
        { provide: ConfigService, useValue: buildConfigService({}) },
      ],
    }).compile();

    service = moduleRef.get<SuspiciousLoginService>(SuspiciousLoginService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('recordFailedAttempt', () => {
    it('runs incr+expire in a single Redis pipeline (atomic pairing)', async () => {
      await service.recordFailedAttempt('wallet-1', '1.2.3.4');

      expect(client.multi).toHaveBeenCalledTimes(1);
      expect(pipeline.incr).toHaveBeenCalledWith('suspicious:failed:wallet-1:1.2.3.4');
      expect(pipeline.expire).toHaveBeenCalledWith(
        'suspicious:failed:wallet-1:1.2.3.4',
        15 * 60,
      );
      expect(pipeline.exec).toHaveBeenCalledTimes(1);
    });
  });

  describe('checkSuspicious', () => {
    it('returns false and does not log when the count is below the threshold', async () => {
      client.get.mockResolvedValue('3');

      const result = await service.checkSuspicious('wallet-1', '1.2.3.4');

      expect(result).toBe(false);
      expect(auditLog).not.toHaveBeenCalled();
    });

    it('returns true and logs SUSPICIOUS_LOGIN_DETECTED when the count crosses the threshold', async () => {
      client.get.mockResolvedValue('5');

      const result = await service.checkSuspicious('wallet-1', '1.2.3.4');

      expect(result).toBe(true);
      expect(auditLog).toHaveBeenCalledWith({
        userId: 'wallet-1',
        eventType: AuditEventType.SUSPICIOUS_LOGIN_DETECTED,
        details: { ip: '1.2.3.4', failedAttempts: 5 },
      });
    });

    it('treats a missing Redis value as zero (not suspicious)', async () => {
      client.get.mockResolvedValue(null);

      const result = await service.checkSuspicious('wallet-1', '1.2.3.4');

      expect(result).toBe(false);
      expect(auditLog).not.toHaveBeenCalled();
    });
  });

  describe('recordSuccessfulLogin', () => {
    it('runs sadd+expire atomically with a bounded retention multiplier', async () => {
      await service.recordSuccessfulLogin('wallet-1', '1.2.3.4');

      expect(client.multi).toHaveBeenCalledTimes(1);
      expect(pipeline.sadd).toHaveBeenCalledWith(
        'suspicious:known_ips:wallet-1',
        '1.2.3.4',
      );
      expect(pipeline.expire).toHaveBeenCalledWith(
        'suspicious:known_ips:wallet-1',
        15 * 60 * 4,
      );
      expect(pipeline.exec).toHaveBeenCalledTimes(1);
    });
  });

  describe('threshold configuration via ConfigService', () => {
    const makeService = async (overrides: Record<string, number>) => {
      const newPipeline: PipelineMock = {
        incr: jest.fn().mockReturnThis(),
        expire: jest.fn().mockReturnThis(),
        sadd: jest.fn().mockReturnThis(),
        exec: jest.fn().mockResolvedValue([]),
      };
      const newClient: ClientMock = {
        multi: jest.fn(() => newPipeline),
        get: jest.fn(),
      };
      const mod = await Test.createTestingModule({
        providers: [
          SuspiciousLoginService,
          {
            provide: RedisService,
            useValue: { getClient: () => newClient },
          },
          { provide: AuditLogService, useValue: { logEvent: jest.fn() } },
          { provide: ConfigService, useValue: buildConfigService(overrides) },
        ],
      }).compile();
      return {
        svc: mod.get<SuspiciousLoginService>(SuspiciousLoginService),
        client: newClient,
        pipeline: newPipeline,
      };
    };

    it('honours MAX_FAILED_ATTEMPTS override (uses ConfigService, not process.env)', async () => {
      const { svc, pipeline: newPipelineLocal, client: c } = await makeService({
        MAX_FAILED_ATTEMPTS: 10,
      });

      c.get.mockResolvedValue('9');
      expect(await svc.checkSuspicious('w', '1.1.1.1')).toBe(false);

      c.get.mockResolvedValue('10');
      expect(await svc.checkSuspicious('w', '1.1.1.1')).toBe(true);
    });

    it('applies TIME_WINDOW_MINUTES override to expire TTL (in seconds)', async () => {
      const { svc, pipeline: newPipelineLocal } = await makeService({
        TIME_WINDOW_MINUTES: 7,
      });
      await svc.recordFailedAttempt('w', '1.1.1.1');

      expect(newPipelineLocal.expire).toHaveBeenCalledWith(
        'suspicious:failed:w:1.1.1.1',
        7 * 60,
      );
    });

    it('falls back to defaults when no override is provided', async () => {
      const { svc, pipeline: newPipelineLocal } = await makeService({});
      await svc.recordFailedAttempt('w', '1.1.1.1');

      expect(newPipelineLocal.expire).toHaveBeenCalledWith(
        'suspicious:failed:w:1.1.1.1',
        15 * 60,
      );
    });
  });
});
