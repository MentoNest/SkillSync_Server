import { SuspiciousActivityService } from './suspicious-activity.service';

const mockClient = {
  incr: jest.fn(),
  expire: jest.fn(),
  set: jest.fn(),
  del: jest.fn(),
  get: jest.fn(),
  ttl: jest.fn(),
  lpush: jest.fn(),
  lrange: jest.fn(),
};
const mockRedis = { getClient: jest.fn(() => mockClient) };
const mockAudit = { logAttempt: jest.fn() };

describe('SuspiciousActivityService', () => {
  let svc: SuspiciousActivityService;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(global, 'fetch').mockResolvedValue({ ok: true } as any);
    svc = new SuspiciousActivityService(mockRedis as any, mockAudit as any);
  });

  afterEach(() => jest.restoreAllMocks());

  describe('trackFailedAttempt', () => {
    it('returns false when below threshold and known IP', async () => {
      mockClient.incr.mockResolvedValue(2);
      mockClient.expire.mockResolvedValue(1);
      mockClient.get.mockResolvedValue('1'); // known IP
      const result = await svc.trackFailedAttempt('WALLET1', '1.2.3.4');
      expect(result).toBe(false);
    });

    it('returns true and flags suspicious when at threshold', async () => {
      process.env.MAX_FAILED_ATTEMPTS = '5';
      mockClient.incr.mockResolvedValue(5);
      mockClient.expire.mockResolvedValue(1);
      mockClient.get.mockResolvedValue('1'); // known IP
      mockClient.lpush.mockResolvedValue(1);

      const result = await svc.trackFailedAttempt('WALLET1', '1.2.3.4');

      expect(result).toBe(true);
      expect(mockAudit.logAttempt).toHaveBeenCalledWith(
        'WALLET1',
        'failure',
        'suspicious_activity',
      );
    });

    it('returns true for new IP regardless of attempt count', async () => {
      mockClient.incr.mockResolvedValue(1);
      mockClient.expire.mockResolvedValue(1);
      mockClient.get.mockResolvedValue(null); // new IP
      mockClient.lpush.mockResolvedValue(1);

      const result = await svc.trackFailedAttempt('WALLET1', '9.9.9.9');
      expect(result).toBe(true);
    });
  });

  describe('registerKnownIp', () => {
    it('sets known IP key and clears fail counter', async () => {
      mockClient.set.mockResolvedValue('OK');
      mockClient.del.mockResolvedValue(1);
      await svc.registerKnownIp('WALLET1', '1.2.3.4');
      expect(mockClient.set).toHaveBeenCalledWith(
        'knownIp:WALLET1:1.2.3.4',
        '1',
        'EX',
        expect.any(Number),
      );
      expect(mockClient.del).toHaveBeenCalledWith('suspiciousFails:WALLET1');
    });
  });

  describe('checkNewIp', () => {
    it('returns true when IP not seen before', async () => {
      mockClient.get.mockResolvedValue(null);
      expect(await svc.checkNewIp('W', '1.1.1.1')).toBe(true);
    });

    it('returns false when IP is known', async () => {
      mockClient.get.mockResolvedValue('1');
      expect(await svc.checkNewIp('W', '1.1.1.1')).toBe(false);
    });
  });

  describe('lockdown', () => {
    it('applyLockdown sets key with 30-min TTL', async () => {
      mockClient.set.mockResolvedValue('OK');
      await svc.applyLockdown('WALLET1');
      expect(mockClient.set).toHaveBeenCalledWith(
        'lockdown:WALLET1',
        '1',
        'EX',
        1800,
      );
    });

    it('isLockedDown returns true when key exists', async () => {
      mockClient.get.mockResolvedValue('1');
      expect(await svc.isLockedDown('WALLET1')).toBe(true);
    });

    it('isLockedDown returns false when key absent', async () => {
      mockClient.get.mockResolvedValue(null);
      expect(await svc.isLockedDown('WALLET1')).toBe(false);
    });

    it('lockdownTtl returns remaining seconds', async () => {
      mockClient.ttl.mockResolvedValue(450);
      expect(await svc.lockdownTtl('WALLET1')).toBe(450);
    });
  });

  describe('getRecentEvents', () => {
    it('parses stored JSON events', async () => {
      const event = { wallet: 'W', ip: '1.2.3.4', reason: 'test', timestamp: 'now' };
      mockClient.lrange.mockResolvedValue([JSON.stringify(event)]);
      const result = await svc.getRecentEvents();
      expect(result).toHaveLength(1);
      expect(result[0].wallet).toBe('W');
    });

    it('skips unparseable entries', async () => {
      mockClient.lrange.mockResolvedValue(['not-json', '{}']);
      const result = await svc.getRecentEvents();
      expect(result).toHaveLength(1);
    });
  });
});
