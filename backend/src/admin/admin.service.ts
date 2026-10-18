import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditLog } from '../audit/entities/audit-log.entity';
import { HealthService } from '../health/health.service';
import { RbacService } from '../rbac/rbac.service';
import { Session } from '../sessions/entities/session.entity';
import { SessionsService } from '../sessions/sessions.service';
import { User } from '../users/entities/user.entity';
import {
  AssignRoleDto,
  AuditQueryDto,
  CreateReportDto,
  ListReportsQueryDto,
  ListSessionsQueryDto,
  ListUsersQueryDto,
  ResolveReportDto,
} from './dto/admin.dto';
import { ContentReport, ReportStatus } from './entities/content-report.entity';

const clampPage = (page?: number, limit?: number) => {
  const p = page && page >= 1 ? page : 1;
  const l = Math.min(limit && limit >= 1 ? limit : 20, 100);
  return { page: p, limit: l, skip: (p - 1) * l };
};

@Injectable()
export class AdminService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(Session) private readonly sessionRepo: Repository<Session>,
    @InjectRepository(AuditLog) private readonly audit: Repository<AuditLog>,
    @InjectRepository(ContentReport) private readonly reports: Repository<ContentReport>,
    private readonly sessions: SessionsService,
    private readonly rbac: RbacService,
    private readonly health: HealthService,
  ) {}

  // ── Users ─────────────────────────────────────────────────────────────────
  async listUsers(query: ListUsersQueryDto) {
    const { page, limit, skip } = clampPage(query.page, query.limit);
    const qb = this.users.createQueryBuilder('u').orderBy('u.createdAt', 'DESC').skip(skip).take(limit);
    if (query.search) {
      qb.andWhere(
        '(u.displayName ILIKE :s OR u.username ILIKE :s OR u.walletAddress ILIKE :s)',
        { s: `%${query.search.replace(/[%_\\]/g, '\\$&')}%` },
      );
    }
    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }

  async getUser(id: string): Promise<User> {
    const user = await this.users.findOne({ where: { id }, relations: ['roles'] });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async deleteUser(id: string, adminId: string): Promise<{ deleted: true }> {
    if (id === adminId) throw new BadRequestException('Admins cannot delete their own account');
    await this.getUser(id);
    await this.users.softDelete(id);
    return { deleted: true };
  }

  async assignRole(id: string, dto: AssignRoleDto): Promise<{ userId: string; role: string }> {
    await this.getUser(id);
    await this.rbac.assignRole(id, dto.role);
    return { userId: id, role: dto.role };
  }

  // ── Sessions ──────────────────────────────────────────────────────────────
  async listSessions(query: ListSessionsQueryDto) {
    const { page, limit, skip } = clampPage(query.page, query.limit);
    const [items, total] = await this.sessionRepo.findAndCount({
      where: query.status ? { status: query.status } : {},
      order: { startTime: 'DESC' },
      skip,
      take: limit,
    });
    return { items, total, page, limit };
  }

  cancelSession(id: string, adminId: string, reason?: string) {
    return this.sessions.cancel(id, adminId, reason ?? 'Cancelled by an administrator', true);
  }

  // ── Content moderation ────────────────────────────────────────────────────
  createReport(reporterId: string, dto: CreateReportDto): Promise<ContentReport> {
    return this.reports.save(this.reports.create({ reporterId, ...dto }));
  }

  async listReports(query: ListReportsQueryDto) {
    const { page, limit, skip } = clampPage(query.page, query.limit);
    const [items, total] = await this.reports.findAndCount({
      where: query.status ? { status: query.status } : {},
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });
    return { items, total, page, limit };
  }

  async resolveReport(id: string, adminId: string, dto: ResolveReportDto): Promise<ContentReport> {
    const report = await this.reports.findOne({ where: { id } });
    if (!report) throw new NotFoundException('Report not found');
    if (report.status !== ReportStatus.OPEN) throw new BadRequestException('Report is already closed');
    report.status = dto.status;
    report.resolvedBy = adminId;
    report.resolutionNote = dto.note ?? null;
    report.resolvedAt = new Date();
    return this.reports.save(report);
  }

  // ── Analytics ─────────────────────────────────────────────────────────────
  /** Key platform metrics. Revenue is not tracked yet (no payments table) and is omitted. */
  async analytics(now: Date = new Date()) {
    const since = new Date(now.getTime() - 30 * 86_400_000);
    const [totalUsers, newUsers30d] = await Promise.all([
      this.users.count(),
      this.users.createQueryBuilder('u').where('u.createdAt >= :since', { since }).getCount(),
    ]);
    const byStatus: { status: string; count: string }[] = await this.sessionRepo
      .createQueryBuilder('s')
      .select('s.status', 'status')
      .addSelect('COUNT(*)', 'count')
      .groupBy('s.status')
      .getRawMany();
    const growth: { day: string; count: string }[] = await this.users
      .createQueryBuilder('u')
      .select("to_char(u.createdAt, 'YYYY-MM-DD')", 'day')
      .addSelect('COUNT(*)', 'count')
      .where('u.createdAt >= :since', { since })
      .groupBy('day')
      .orderBy('day', 'ASC')
      .getRawMany();

    return {
      users: { total: totalUsers, newLast30Days: newUsers30d },
      userGrowth: growth.map((g) => ({ day: g.day, count: Number(g.count) })),
      sessions: Object.fromEntries(byStatus.map((r) => [r.status, Number(r.count)])),
    };
  }

  async systemHealth() {
    return (await this.health.check()).report;
  }

  // ── Audit log ─────────────────────────────────────────────────────────────
  async auditLogs(query: AuditQueryDto) {
    const { page, limit, skip } = clampPage(query.page, query.limit);
    const qb = this.audit.createQueryBuilder('a').orderBy('a.createdAt', 'DESC').skip(skip).take(limit);
    if (query.event) qb.andWhere('a.event = :event', { event: query.event });
    if (query.userId) qb.andWhere('a.userId = :userId', { userId: query.userId });
    if (query.from) qb.andWhere('a.createdAt >= :from', { from: new Date(query.from) });
    if (query.to) qb.andWhere('a.createdAt <= :to', { to: new Date(query.to) });
    const [items, total] = await qb.getManyAndCount();
    return { items, total, page, limit };
  }
}
