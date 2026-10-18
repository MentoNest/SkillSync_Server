import { BadRequestException, NotFoundException } from '@nestjs/common';
import { AdminService } from './admin.service';
import { ReportStatus } from './entities/content-report.entity';

function build() {
  const users: any = {
    findOne: jest.fn(),
    softDelete: jest.fn().mockResolvedValue({}),
    count: jest.fn().mockResolvedValue(5),
  };
  const reports: any = {
    create: jest.fn((v: unknown) => v),
    save: jest.fn((v: unknown) => Promise.resolve(v)),
    findOne: jest.fn(),
  };
  const sessions: any = { cancel: jest.fn().mockResolvedValue({ status: 'cancelled' }) };
  const rbac: any = { assignRole: jest.fn().mockResolvedValue(undefined) };
  const service = new AdminService(users, {} as any, {} as any, reports, sessions, rbac, {} as any);
  return { service, users, reports, sessions, rbac };
}

describe('AdminService', () => {
  it('soft-deletes other users but not the acting admin', async () => {
    const { service, users } = build();
    users.findOne.mockResolvedValue({ id: 'u1' });
    await expect(service.deleteUser('admin-1', 'admin-1')).rejects.toThrow(BadRequestException);
    await expect(service.deleteUser('u1', 'admin-1')).resolves.toEqual({ deleted: true });
    expect(users.softDelete).toHaveBeenCalledWith('u1');
  });

  it('404s for unknown users', async () => {
    const { service, users } = build();
    users.findOne.mockResolvedValue(null);
    await expect(service.getUser('nope')).rejects.toThrow(NotFoundException);
  });

  it('assigns roles through RBAC', async () => {
    const { service, users, rbac } = build();
    users.findOne.mockResolvedValue({ id: 'u1' });
    await service.assignRole('u1', { role: 'mentor' as any });
    expect(rbac.assignRole).toHaveBeenCalledWith('u1', 'mentor');
  });

  it('cancels sessions with admin override', async () => {
    const { service, sessions } = build();
    await service.cancelSession('s1', 'admin-1', 'abuse');
    expect(sessions.cancel).toHaveBeenCalledWith('s1', 'admin-1', 'abuse', true);
  });

  it('creates reports and resolves them once', async () => {
    const { service, reports } = build();
    const created = await service.createReport('u1', { targetType: 'user', targetId: 'u2', reason: 'spam' });
    expect(created).toMatchObject({ reporterId: 'u1', targetType: 'user' });

    reports.findOne.mockResolvedValue({ id: 'r1', status: ReportStatus.OPEN });
    const resolved = await service.resolveReport('r1', 'admin-1', { status: ReportStatus.RESOLVED, note: 'removed' });
    expect(resolved).toMatchObject({ status: ReportStatus.RESOLVED, resolvedBy: 'admin-1' });

    reports.findOne.mockResolvedValue({ id: 'r1', status: ReportStatus.RESOLVED });
    await expect(service.resolveReport('r1', 'admin-1', { status: ReportStatus.DISMISSED })).rejects.toThrow(
      BadRequestException,
    );
  });
});
