import { ServiceUnavailableException } from '@nestjs/common';
import {
  BusinessRuleException,
  ResourceNotFoundException,
} from '../../common/errors/app-exceptions';
import { PaginationService } from '../../common/pagination/pagination.service';
import { Role } from '../../auth/auth.types';
import { RoleEntity } from '../../user/role.entity';
import { UserStatus } from '../../user/user-status.enum';
import { AuditEvent } from '../../audit/entities/audit-log.entity';
import { AdminService } from '../admin.service';
import { DisputeResolution, ReportAction } from '../dto/admin.dto';
import { AdminSessionStatus } from '../entities/admin-session.entity';
import {
  ReportStatus,
  ReportTargetType,
} from '../entities/content-report.entity';

const ADMIN = 'GB63QAFLU5E2ZA3CABIHR2E272RLJ6OP2SINL2HIZEEXQLMEXYOND6NC';
const USER = 'GA6IX2SMH3I6EK4JABGRS2TCQVBGCK6HX4VHWEJKD3JGCTB2JNO5E4G5';

function queryBuilder() {
  return {
    leftJoinAndSelect: jest.fn().mockReturnThis(),
    andWhere: jest.fn().mockReturnThis(),
    withDeleted: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    addSelect: jest.fn().mockReturnThis(),
    groupBy: jest.fn().mockReturnThis(),
    orderBy: jest.fn().mockReturnThis(),
    skip: jest.fn().mockReturnThis(),
    take: jest.fn().mockReturnThis(),
    getManyAndCount: jest.fn().mockResolvedValue([[{ id: 'row-1' }], 1]),
    getRawMany: jest
      .fn()
      .mockResolvedValue([{ status: 'confirmed', count: '2' }]),
    getCount: jest.fn().mockResolvedValue(3),
  };
}

function repository(qb: ReturnType<typeof queryBuilder>) {
  return {
    findOne: jest.fn(),
    create: jest.fn((value: unknown) => value),
    save: jest.fn((value: unknown) => Promise.resolve(value)),
    softDelete: jest.fn().mockResolvedValue({}),
    restore: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
    count: jest.fn().mockResolvedValue(10),
    createQueryBuilder: jest.fn(() => qb),
  };
}

function build() {
  const qb = queryBuilder();
  const users = repository(qb);
  const roles = repository(qb);
  const reports = repository(qb);
  const sessions = repository(qb);
  const auditLogs = repository(qb);
  const userService = {
    setStatus: jest
      .fn()
      .mockResolvedValue({ walletAddress: USER, status: UserStatus.SUSPENDED }),
    softDelete: jest.fn().mockResolvedValue(undefined),
    restore: jest
      .fn()
      .mockResolvedValue({ walletAddress: USER, status: UserStatus.ACTIVE }),
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const pagination = new PaginationService();
  const dataSource = {
    isInitialized: true,
    query: jest.fn().mockResolvedValue([{ ok: 1 }]),
  };
  const service = new AdminService(
    users as any,
    roles as any,
    reports as any,
    sessions as any,
    auditLogs as any,
    userService as any,
    audit as any,
    pagination,
    dataSource as any,
  );
  return {
    service,
    qb,
    users,
    roles,
    reports,
    sessions,
    auditLogs,
    userService,
    audit,
    dataSource,
  };
}

describe('AdminService', () => {
  it('paginates, filters and allowlists sorting for user listings', async () => {
    const { service, qb } = build();
    const result = await service.listUsers({
      page: 2,
      limit: 10,
      status: UserStatus.ACTIVE,
      role: 'mentor',
      search: 'alice',
      sort: 'createdAt',
      order: 'ASC',
    } as any);

    expect(result.meta).toMatchObject({ page: 2, limit: 10, total: 1 });
    expect(qb.andWhere).toHaveBeenCalledWith('u.status = :status', {
      status: UserStatus.ACTIVE,
    });
    expect(qb.andWhere).toHaveBeenCalledWith('u.role = :role', {
      role: 'mentor',
    });
    expect(qb.orderBy).toHaveBeenCalledWith('u.createdAt', 'ASC');
    expect(qb.skip).toHaveBeenCalledWith(10);
    expect(qb.take).toHaveBeenCalledWith(10);
  });

  it('falls back to a safe sort column when an unsupported one reaches the service', async () => {
    const { service, qb } = build();
    await service.listUsers({ sort: 'password', page: 1, limit: 20 });
    expect(qb.orderBy).toHaveBeenCalledWith('u.createdAt', 'DESC');
  });

  it('normalizes wallet addresses and 404s for unknown users', async () => {
    const { service, users } = build();
    users.findOne.mockResolvedValueOnce(null);
    await expect(service.getUser(USER.toUpperCase())).rejects.toBeInstanceOf(
      ResourceNotFoundException,
    );
    expect(users.findOne).toHaveBeenCalledWith(
      expect.objectContaining({ where: { walletAddress: USER.toLowerCase() } }),
    );

    users.findOne.mockResolvedValueOnce({ walletAddress: USER });
    await expect(service.getUser(USER)).resolves.toEqual({
      walletAddress: USER,
    });
  });

  it('suspends users through UserService and records an audit event', async () => {
    const { service, users, userService, audit } = build();
    users.findOne.mockResolvedValue({ walletAddress: USER });
    await service.suspendUser(USER, ADMIN);
    expect(userService.setStatus).toHaveBeenCalledWith(
      USER.toLowerCase(),
      UserStatus.SUSPENDED,
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        event: AuditEvent.USER_SUSPENDED,
        walletAddress: ADMIN,
        targetId: USER.toLowerCase(),
      }),
    );
  });

  it('refuses to delete the acting admin but soft deletes other users', async () => {
    const { service, users, userService } = build();
    users.findOne.mockResolvedValue({ walletAddress: ADMIN });
    await expect(service.deleteUser(ADMIN, ADMIN)).rejects.toBeInstanceOf(
      BusinessRuleException,
    );
    expect(userService.softDelete).not.toHaveBeenCalled();

    await service.deleteUser(USER, ADMIN);
    expect(userService.softDelete).toHaveBeenCalledWith(USER.toLowerCase());
  });

  it('restores users through UserService', async () => {
    const { service, userService, audit } = build();
    await service.restoreUser(USER, ADMIN);
    expect(userService.restore).toHaveBeenCalledWith(USER.toLowerCase());
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ event: AuditEvent.USER_RESTORED }),
    );
  });

  it('creates a missing RoleEntity and assigns it with denormalized role conventions', async () => {
    const { service, users, roles, audit } = build();
    users.findOne.mockResolvedValue({ walletAddress: USER, roles: [] });
    roles.findOne.mockResolvedValueOnce(null);
    roles.create.mockImplementationOnce((value: unknown) => ({
      name: (value as RoleEntity).name,
      permissions: ['*'],
    }));

    await expect(
      service.assignRole(USER, { role: Role.MENTOR }, ADMIN),
    ).resolves.toEqual({
      walletAddress: USER.toLowerCase(),
      role: Role.MENTOR,
    });
    expect(roles.save).toHaveBeenCalledTimes(1);
    expect(users.save).toHaveBeenCalledWith(
      expect.objectContaining({
        roles: [expect.objectContaining({ name: Role.MENTOR })],
      }),
    );
    expect(users.update).toHaveBeenCalledWith(
      { walletAddress: USER.toLowerCase() },
      { role: Role.MENTOR },
    );
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({
        event: AuditEvent.ROLE_ASSIGNED,
        walletAddress: ADMIN,
        targetId: USER.toLowerCase(),
      }),
    );
  });

  it('filters sessions by wallet and status with a safe sort', async () => {
    const { service, qb } = build();
    await service.listSessions({
      status: AdminSessionStatus.CONFIRMED,
      walletAddress: USER,
      search: 'review',
      sort: 'startTime',
      order: 'ASC',
      page: 1,
      limit: 5,
    } as any);
    expect(qb.andWhere).toHaveBeenCalledWith(
      'CAST(s.status AS text) = :status',
      {
        status: AdminSessionStatus.CONFIRMED,
      },
    );
    expect(qb.orderBy).toHaveBeenCalledWith('s.startTime', 'ASC');
    expect(qb.skip).toHaveBeenCalledWith(0);
  });

  it('cancels sessions with admin override details', async () => {
    const { service, sessions, audit } = build();
    sessions.findOne.mockResolvedValue({
      id: 's1',
      status: AdminSessionStatus.CONFIRMED,
    });
    const saved = await service.cancelSession('s1', ADMIN, { reason: 'abuse' });
    expect(saved).toMatchObject({
      status: AdminSessionStatus.CANCELLED,
      cancellationReason: 'abuse',
    });
    expect(saved.notes).toContain(ADMIN.toLowerCase());
    expect(sessions.save).toHaveBeenCalledTimes(1);
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ event: AuditEvent.SESSION_CANCELLED }),
    );

    sessions.findOne.mockResolvedValue({
      id: 's1',
      status: AdminSessionStatus.CANCELLED,
    });
    await expect(service.cancelSession('s1', ADMIN, {})).rejects.toBeInstanceOf(
      BusinessRuleException,
    );
  });

  it('resolves disputes into concrete session statuses', async () => {
    const { service, sessions, audit } = build();
    sessions.findOne.mockResolvedValue({
      id: 's1',
      status: AdminSessionStatus.CONFIRMED,
      notes: 'original',
    });
    const saved = await service.resolveDispute('s1', ADMIN, {
      resolution: DisputeResolution.COMPLETE,
      reason: 'resolved',
    });
    expect(saved.status).toBe(AdminSessionStatus.COMPLETED);
    expect(saved.notes).toContain('original');
    expect(saved.notes).toContain('resolved');
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ event: AuditEvent.DISPUTE_RESOLVED }),
    );
  });

  it('aggregates session statistics by status', async () => {
    const { service, qb } = build();
    qb.getRawMany.mockResolvedValueOnce([
      { status: 'confirmed', count: '2' },
      { status: 'cancelled', count: '1' },
    ]);
    await expect(service.sessionStats()).resolves.toEqual({
      total: 3,
      byStatus: { confirmed: 2, cancelled: 1 },
      active: 2,
      completed: 0,
      cancelled: 1,
    });
  });

  it('computes user growth with a bounded window and numeric counts', async () => {
    const { service, qb } = build();
    const now = new Date('2026-11-23T00:00:00.000Z');
    qb.getRawMany.mockResolvedValueOnce([{ day: '2026-11-22', count: '4' }]);
    const result = await service.userGrowth(1000, now);
    expect(result.total).toBe(10);
    expect(result.newUsers).toBe(3);
    expect(result.days).toBe(365);
    expect(result.growth).toEqual([{ day: '2026-11-22', count: 4 }]);
  });

  it('returns an explicit revenue placeholder and combined analytics', async () => {
    const { service, qb } = build();
    qb.getRawMany.mockResolvedValue([]);
    expect(service.revenue()).toMatchObject({ available: false, amount: 0 });
    const result = await service.analytics({ days: 7 });
    expect(result).toMatchObject({
      users: { days: 7 },
      sessions: { total: 0 },
      revenue: { available: false },
    });
  });

  it('reports system health only when the datasource answers', async () => {
    const { service, dataSource } = build();
    await expect(service.systemHealth()).resolves.toMatchObject({
      status: 'ok',
      database: 'up',
    });
    dataSource.isInitialized = false;
    await expect(service.systemHealth()).rejects.toBeInstanceOf(
      ServiceUnavailableException,
    );
  });

  it('creates reports for the signed-in reporter', async () => {
    const { service, reports, audit } = build();
    const created = await service.createReport(ADMIN, {
      targetType: ReportTargetType.USER,
      targetId: USER,
      reason: 'spam',
    });
    expect(reports.create).toHaveBeenCalledWith(
      expect.objectContaining({
        reporterId: ADMIN.toLowerCase(),
        targetType: ReportTargetType.USER,
        status: ReportStatus.OPEN,
      }),
    );
    expect(created).toMatchObject({
      reporterId: ADMIN.toLowerCase(),
      status: ReportStatus.OPEN,
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ event: AuditEvent.REPORT_CREATED }),
    );
  });

  it('lists reports with deleted rows and reporter filtering', async () => {
    const { service, qb } = build();
    await service.listReports({
      includeDeleted: true,
      reporterId: USER,
      status: ReportStatus.OPEN,
      sort: 'status',
      page: 1,
      limit: 20,
    });
    expect(qb.withDeleted).toHaveBeenCalled();
    expect(qb.andWhere).toHaveBeenCalledWith('r.reporterId = :reporterId', {
      reporterId: USER.toLowerCase(),
    });
    expect(qb.orderBy).toHaveBeenCalledWith('r.status', 'DESC');
  });

  it('resolves open reports once and rejects closed reports', async () => {
    const { service, reports, audit } = build();
    reports.findOne.mockResolvedValueOnce({
      id: 'r1',
      status: ReportStatus.OPEN,
    });
    const resolved = await service.resolveReport('r1', ADMIN, {
      status: ReportStatus.RESOLVED,
      note: 'removed',
    });
    expect(resolved).toMatchObject({
      status: ReportStatus.RESOLVED,
      resolvedBy: ADMIN.toLowerCase(),
      resolutionNote: 'removed',
    });
    expect(audit.record).toHaveBeenCalledWith(
      expect.objectContaining({ event: AuditEvent.REPORT_RESOLVED }),
    );

    reports.findOne.mockResolvedValueOnce({
      id: 'r1',
      status: ReportStatus.DISMISSED,
    });
    await expect(
      service.resolveReport('r1', ADMIN, { status: ReportStatus.RESOLVED }),
    ).rejects.toBeInstanceOf(BusinessRuleException);
  });

  it('applies moderation actions and maps dismiss to a dismissed report', async () => {
    const { service, reports } = build();
    reports.findOne.mockResolvedValue({ id: 'r1', status: ReportStatus.OPEN });
    await expect(
      service.takeReportAction('r1', ADMIN, {
        action: ReportAction.DISMISS,
        note: 'false positive',
      }),
    ).resolves.toMatchObject({
      status: ReportStatus.DISMISSED,
      resolutionNote: 'dismiss: false positive',
    });
  });

  it('soft deletes and restores reports without restoring live reports', async () => {
    const { service, reports } = build();
    reports.findOne.mockResolvedValueOnce({
      id: 'r1',
      status: ReportStatus.OPEN,
    });
    await expect(service.softDeleteReport('r1', ADMIN)).resolves.toEqual({
      deleted: true,
    });
    expect(reports.softDelete).toHaveBeenCalledWith('r1');

    reports.findOne.mockResolvedValueOnce({ id: 'r1', deletedAt: new Date() });
    reports.findOne.mockResolvedValueOnce({ id: 'r1', deletedAt: null });
    await expect(service.restoreReport('r1', ADMIN)).resolves.toMatchObject({
      id: 'r1',
    });
    expect(reports.restore).toHaveBeenCalledWith('r1');

    reports.findOne.mockResolvedValueOnce({ id: 'r1', deletedAt: null });
    await expect(service.restoreReport('r1', ADMIN)).rejects.toBeInstanceOf(
      BusinessRuleException,
    );
  });

  it('filters audit logs by event, wallet, target and time window', async () => {
    const { service, qb } = build();
    await service.auditLogs({
      event: AuditEvent.ROLE_ASSIGNED,
      walletAddress: ADMIN,
      targetId: USER,
      from: '2026-01-01T00:00:00.000Z',
      to: '2026-02-01T00:00:00.000Z',
      sort: 'event',
      page: 1,
      limit: 20,
    });
    expect(qb.andWhere).toHaveBeenCalledWith('a.event = :event', {
      event: AuditEvent.ROLE_ASSIGNED,
    });
    expect(qb.andWhere).toHaveBeenCalledWith(
      'a.walletAddress = :walletAddress',
      {
        walletAddress: ADMIN.toLowerCase(),
      },
    );
    expect(qb.andWhere).toHaveBeenCalledWith('a.targetId = :targetId', {
      targetId: USER,
    });
    expect(qb.orderBy).toHaveBeenCalledWith('a.event', 'DESC');
  });

  it('404s for unknown sessions and reports', async () => {
    const { service, sessions, reports } = build();
    sessions.findOne.mockResolvedValue(null);
    reports.findOne.mockResolvedValue(null);
    await expect(service.getSession('missing')).rejects.toBeInstanceOf(
      ResourceNotFoundException,
    );
    await expect(service.getReport('missing')).rejects.toBeInstanceOf(
      ResourceNotFoundException,
    );
  });
});
