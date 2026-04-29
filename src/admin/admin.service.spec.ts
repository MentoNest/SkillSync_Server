import { Test, TestingModule } from '@nestjs/testing';
import { AdminService } from './admin.service';

describe('AdminService', () => {
  let service: AdminService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [AdminService],
    }).compile();

    service = module.get<AdminService>(AdminService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('getUsers', () => {
    it('should return paginated users with metadata', async () => {
      const query = { page: '1', limit: '10' };
      const result = await service.getUsers(query);

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('meta');
      expect(result.meta.page).toBe(1);
      expect(result.meta.limit).toBe(10);
      expect(result.meta.total).toBe(0);
      expect(Array.isArray(result.data)).toBe(true);
    });

    it('should convert string page and limit to numbers', async () => {
      const query = { page: '5', limit: '25' };
      const result = await service.getUsers(query);

      expect(typeof result.meta.page).toBe('number');
      expect(typeof result.meta.limit).toBe('number');
      expect(result.meta.page).toBe(5);
      expect(result.meta.limit).toBe(25);
    });
  });

  describe('suspendUser', () => {
    it('should suspend a user', async () => {
      const userId = 'user-123';
      const result = await service.suspendUser(userId);

      expect(result).toHaveProperty('message');
      expect(result.message).toBe('User suspended');
    });
  });

  describe('assignRole', () => {
    it('should assign role to user', async () => {
      const userId = 'user-123';
      const result = await service.assignRole(userId);

      expect(result).toHaveProperty('message');
      expect(result.message).toBe('Role updated');
    });
  });

  describe('softDeleteUser', () => {
    it('should soft delete a user', async () => {
      const userId = 'user-123';
      const result = await service.softDeleteUser(userId);

      expect(result).toHaveProperty('message');
      expect(result.message).toBe('User soft deleted');
    });
  });

  describe('getSessions', () => {
    it('should return sessions with metadata', async () => {
      const query = { page: '1', limit: '20' };
      const result = await service.getSessions(query);

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('meta');
      expect(Array.isArray(result.data)).toBe(true);
    });
  });

  describe('cancelSession', () => {
    it('should cancel a session', async () => {
      const sessionId = 'session-123';
      const result = await service.cancelSession(sessionId);

      expect(result).toHaveProperty('message');
      expect(result.message).toBe('Session cancelled');
    });
  });

  describe('getReports', () => {
    it('should return reports with metadata', async () => {
      const query = { page: '1', limit: '10' };
      const result = await service.getReports(query);

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('meta');
      expect(Array.isArray(result.data)).toBe(true);
    });
  });

  describe('resolveReport', () => {
    it('should resolve a report', async () => {
      const reportId = 'report-123';
      const result = await service.resolveReport(reportId);

      expect(result).toHaveProperty('message');
      expect(result.message).toBe('Report resolved');
    });
  });

  describe('getAnalytics', () => {
    it('should return analytics data', async () => {
      const result = await service.getAnalytics();

      expect(result).toHaveProperty('users');
      expect(result).toHaveProperty('sessions');
      expect(result).toHaveProperty('revenue');
      expect(typeof result.users).toBe('number');
      expect(typeof result.sessions).toBe('number');
      expect(typeof result.revenue).toBe('number');
      expect(result.users).toBe(1200);
      expect(result.sessions).toBe(340);
      expect(result.revenue).toBe(5000);
    });
  });

  describe('getAuditLogs', () => {
    it('should return audit logs with metadata', async () => {
      const query = { page: '1', limit: '50' };
      const result = await service.getAuditLogs(query);

      expect(result).toHaveProperty('data');
      expect(result).toHaveProperty('meta');
      expect(Array.isArray(result.data)).toBe(true);
    });
  });
});
